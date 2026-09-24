// app/routes/api/cron.archive-stale.test.ts
// API-006. Vercel's scheduler invokes a cron path with an HTTP GET and sends
// CRON_SECRET as an Authorization: Bearer header automatically, so GET is the
// method that has to work; POST is accepted too. A self-hosted instance runs no
// scheduled cleanup and answers 404 (ADR-0020).
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockArchiveStaleBoards = vi.fn();
vi.mock("~/server/auto_archive", () => ({
  archiveStaleBoards: (...args: unknown[]) => mockArchiveStaleBoards(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockArchiveStaleBoards.mockResolvedValue({ archived: 0 });
});

function req(method: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/v1/cron/archive-stale", { method, headers });
}

// cronSecret is read once at module init (app/server/db_config.ts), so a test
// that needs a different value re-imports the route with the module mocked.
async function loadRoute(cronSecret: string | null) {
  vi.resetModules();
  vi.doMock("~/server/db_config", () => ({ cronSecret }));
  return import("./cron.archive-stale");
}

function call(handler: unknown, request: Request) {
  return (handler as (args: { request: Request }) => Promise<Response> | Response)({ request });
}

describe("GET /api/v1/cron/archive-stale — how Vercel invokes it [API-006]", () => {
  it("archives and returns the count when the bearer secret matches", async () => {
    const { loader } = await loadRoute("test-secret");
    mockArchiveStaleBoards.mockResolvedValueOnce({ archived: 7 });

    const response = (await call(loader, req("GET", { Authorization: "Bearer test-secret" }))) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ archived: 7 });
    expect(mockArchiveStaleBoards).toHaveBeenCalledTimes(1);
  });

  it("returns 401 and archives nothing without the secret", async () => {
    const { loader } = await loadRoute("test-secret");

    const response = (await call(loader, req("GET"))) as Response;

    expect(response.status).toBe(401);
    expect(mockArchiveStaleBoards).not.toHaveBeenCalled();
  });

  it("returns 401 and archives nothing when the secret is wrong", async () => {
    const { loader } = await loadRoute("test-secret");

    const response = (await call(loader, req("GET", { Authorization: "Bearer wrong-secret" }))) as Response;

    expect(response.status).toBe(401);
    expect(mockArchiveStaleBoards).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/cron/archive-stale [API-006]", () => {
  it("archives and returns the count when the bearer secret matches", async () => {
    const { action } = await loadRoute("test-secret");
    mockArchiveStaleBoards.mockResolvedValueOnce({ archived: 3 });

    const response = (await call(action, req("POST", { Authorization: "Bearer test-secret" }))) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ archived: 3 });
  });

  it("returns 401 without the secret", async () => {
    const { action } = await loadRoute("test-secret");

    const response = (await call(action, req("POST"))) as Response;

    expect(response.status).toBe(401);
    expect(mockArchiveStaleBoards).not.toHaveBeenCalled();
  });

  it("rejects any other method with 405", async () => {
    const { action } = await loadRoute("test-secret");

    const response = (await call(action, req("DELETE", { Authorization: "Bearer test-secret" }))) as Response;

    expect(response.status).toBe(405);
    expect(mockArchiveStaleBoards).not.toHaveBeenCalled();
  });
});

describe("/api/v1/cron/archive-stale on a self-hosted instance (ADR-0020) [API-006]", () => {
  it("returns 404 and archives nothing, whatever the method or credential", async () => {
    const { loader, action } = await loadRoute(null);

    // "Bearer null" is what a naive `Bearer ${cronSecret}` comparison would accept
    // when no secret is configured.
    const viaGet = (await call(loader, req("GET", { Authorization: "Bearer null" }))) as Response;
    const viaPost = (await call(action, req("POST", { Authorization: "Bearer anything" }))) as Response;

    expect(viaGet.status).toBe(404);
    expect(viaPost.status).toBe(404);
    expect(mockArchiveStaleBoards).not.toHaveBeenCalled();
  });
});

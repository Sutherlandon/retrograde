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
  return new Request("http://localhost:3000/api/v1/cron/archive-stale", {
    method,
    headers,
  });
}

// cronSecret is loaded once at module init (app/server/db_config.ts), so each
// test that needs a different value mocks the module and re-imports the
// route fresh via vi.resetModules().
async function loadRoute(cronSecret: string | undefined) {
  vi.resetModules();
  vi.doMock("~/server/db_config", () => ({ cronSecret }));
  return import("./cron.archive-stale");
}

describe("POST /api/v1/cron/archive-stale", () => {
  it("returns 200 and the archive count when the secret matches (API-006)", async () => {
    const { action } = await loadRoute("test-secret");
    mockArchiveStaleBoards.mockResolvedValueOnce({ archived: 7 });

    const response = (await action({
      request: req("POST", { Authorization: "Bearer test-secret" }),
      params: {}, context: {},
    } as never)) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ archived: 7 });
    expect(mockArchiveStaleBoards).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when the secret is missing", async () => {
    const { action } = await loadRoute("test-secret");
    const response = (await action({
      request: req("POST"),
      params: {}, context: {},
    } as never)) as Response;
    expect(response.status).toBe(401);
    expect(mockArchiveStaleBoards).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret is wrong", async () => {
    const { action } = await loadRoute("test-secret");
    const response = (await action({
      request: req("POST", { Authorization: "Bearer wrong" }),
      params: {}, context: {},
    } as never)) as Response;
    expect(response.status).toBe(401);
    expect(mockArchiveStaleBoards).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is not configured", async () => {
    const { action } = await loadRoute(undefined);
    const response = (await action({
      request: req("POST", { Authorization: "Bearer anything" }),
      params: {}, context: {},
    } as never)) as Response;
    expect(response.status).toBe(500);
    expect(mockArchiveStaleBoards).not.toHaveBeenCalled();
  });

  it("rejects GET with 405", async () => {
    const { loader } = await loadRoute("test-secret");
    const response = loader() as Response;
    expect(response.status).toBe(405);
  });
});

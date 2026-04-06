import { describe, it, expect, vi, beforeEach } from "vitest";

// Track session data across mock calls
let sessionData: Record<string, string> = {};

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => ({
    get: (key: string) => sessionData[key],
    set: (key: string, value: string) => { sessionData[key] = value; },
    unset: (key: string) => { delete sessionData[key]; },
  })),
  commitSession: vi.fn(async () => "session-cookie-value"),
}));

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

vi.mock("~/config/siteConfig", () => ({
  siteConfig: {
    dashboardHome: false,
    usernameField: "preferred_username",
  },
}));

const mockCreateBoard = vi.fn();
const mockSetBoardOwner = vi.fn();
vi.mock("~/server/board_model", () => ({
  createBoard: (...args: unknown[]) => mockCreateBoard(...args),
  setBoardOwner: (...args: unknown[]) => mockSetBoardOwner(...args),
}));

// Stub fetch for Turnstile verification
vi.stubGlobal("fetch", vi.fn());

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockCreateBoard.mockResolvedValue("new-board-id");
  mockSetBoardOwner.mockResolvedValue(undefined);
});

function makeFormData(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return form;
}

describe("home page action", () => {
  it("creates board and anonymous user when no session exists", async () => {
    const { action } = await import("./home");

    // getOrCreateUser will INSERT anonymous user
    const anonId = "anon-uuid-123";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const formData = makeFormData({ title: "My Retro", no_jerks: "on" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} }) as unknown as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/board/new-board-id");
    expect(response.headers.get("Set-Cookie")).toBe("session-cookie-value");
    expect(mockCreateBoard).toHaveBeenCalledWith("My Retro");
    expect(mockSetBoardOwner).toHaveBeenCalledWith("new-board-id", anonId);
  });

  it("creates board with existing registered user session", async () => {
    const { action } = await import("./home");

    sessionData["userId"] = "registered-user-1";
    // getOrCreateUser SELECT returns existing user
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "registered-user-1", preferred_username: "realuser" }],
      rowCount: 1,
    });

    const formData = makeFormData({ title: "Team Retro", no_jerks: "on" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} }) as unknown as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/board/new-board-id");
    // No Set-Cookie needed for existing user
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(mockSetBoardOwner).toHaveBeenCalledWith("new-board-id", "registered-user-1");
  });

  it("returns validation error when title is too short", async () => {
    const { action } = await import("./home");
    const formData = makeFormData({ title: "ab", no_jerks: "on" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} }) as unknown as Response;
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.errors.title).toBeDefined();
  });

  it("returns validation error when kindness checkbox not checked", async () => {
    const { action } = await import("./home");
    const formData = makeFormData({ title: "Valid Title" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} }) as unknown as Response;
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.errors.no_jerks).toBeDefined();
  });
});

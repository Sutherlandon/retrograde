import { describe, it, expect, vi, beforeEach } from "vitest";

let sessionData: Record<string, string> = {};

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => ({
    get: (key: string) => sessionData[key],
    set: (key: string, value: string) => {
      sessionData[key] = value;
    },
    unset: (key: string) => {
      delete sessionData[key];
    },
  })),
  commitSession: vi.fn(async () => "__session=signed-token-value; Path=/; HttpOnly"),
}));

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: vi.fn(),
  },
}));

vi.mock("~/server/db_init", () => ({}));

vi.mock("~/config/siteConfig", () => ({
  siteConfig: { usernameField: "preferred_username" },
}));

const mockCreateAgentUser = vi.fn();
const mockGetApiUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  createAgentUser: (...args: unknown[]) => mockCreateAgentUser(...args),
  getApiUser: (...args: unknown[]) => mockGetApiUser(...args),
  getOptionalUser: vi.fn(),
}));

const mockCreateBoardWithColumns = vi.fn();
vi.mock("~/server/board_model", () => ({
  createBoardWithColumns: (...args: unknown[]) => mockCreateBoardWithColumns(...args),
}));

const mockGetPersonalTeamForUser = vi.fn();
vi.mock("~/server/team_model", () => ({
  getPersonalTeamForUser: (...args: unknown[]) => mockGetPersonalTeamForUser(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockCreateAgentUser.mockResolvedValue("agent-uuid");
  mockCreateBoardWithColumns.mockResolvedValue("board-uuid");
  mockGetApiUser.mockResolvedValue(null); // unauthenticated trial flow by default
  mockPoolQuery.mockResolvedValue({ rows: [{ is_agent: false, is_anonymous: false }], rowCount: 1 });
  mockGetPersonalTeamForUser.mockResolvedValue({ id: "personal-team-1", name: "Personal", is_personal: true, created_at: "" });
});

function req(body: unknown, method = "POST") {
  return new Request("http://localhost:3000/api/v1/boards", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/v1/boards", () => {
  it("creates a board with custom columns, mints an agent user, returns token (API-002)", async () => {
    const { action } = await import("./boards");

    const response = (await action({
      request: req({
        title: "Roadmap H2",
        display_name: "Claude",
        columns: [{ title: "Backend" }, { title: "Frontend" }],
      }),
      params: {},
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      board_id: string;
      board_url: string;
      agent_token: string;
    };
    expect(json.board_id).toBe("board-uuid");
    expect(json.board_url).toBe("http://localhost:3000/app/board/board-uuid");
    expect(json.agent_token).toBe("signed-token-value");
    expect(response.headers.get("Set-Cookie")).toContain("__session=signed-token-value");

    expect(mockCreateAgentUser).toHaveBeenCalledWith(null, "Claude");
    expect(mockCreateBoardWithColumns).toHaveBeenCalledWith(
      "Roadmap H2",
      [{ title: "Backend" }, { title: "Frontend" }],
      "agent-uuid",
      null
    );
  });

  it("defaults display_name to 'Agent' when omitted", async () => {
    const { action } = await import("./boards");
    await action({
      request: req({ title: "Plain" }),
      params: {},
      context: {},
    } as never);
    expect(mockCreateAgentUser).toHaveBeenCalledWith(null, "Agent");
    expect(mockCreateBoardWithColumns).toHaveBeenCalledWith("Plain", [], "agent-uuid", null);
  });

  it("attaches the board to the caller's team when authenticated via API key (API-001)", async () => {
    const { action } = await import("./boards");
    mockGetApiUser.mockResolvedValueOnce({
      id: "agent-from-key",
      username: "Claude (test)",
      teamId: "team-acme",
    });

    const response = (await action({
      request: req({ title: "Team Roadmap", columns: [] }),
      params: {},
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      board_id: string;
      board_url: string;
      team_id: string;
      agent_token?: string;
    };
    expect(json.board_id).toBe("board-uuid");
    expect(json.team_id).toBe("team-acme");
    expect(json.agent_token).toBeUndefined(); // no anonymous token for authenticated callers

    // No trial agent user creation; uses authed user directly
    expect(mockCreateAgentUser).not.toHaveBeenCalled();
    expect(mockCreateBoardWithColumns).toHaveBeenCalledWith(
      "Team Roadmap",
      [],
      "agent-from-key",
      "team-acme"
    );
    // No personal-team lookup: the API key already carried a teamId.
    expect(mockGetPersonalTeamForUser).not.toHaveBeenCalled();
  });

  // GAP-002: createBoardWithColumns now writes the owner row itself (iff
  // teamId is set), so this route no longer calls setBoardOwner directly.
  // The edge case is a registered, non-agent browser session with no team on
  // the request (getApiUser's cookie-session path never sets teamId) — that
  // caller must still end up owning a board on a crew per ADR-0003, so we
  // attach their personal team before creating the board.
  it("attaches the caller's personal team when a registered session has no teamId", async () => {
    const { action } = await import("./boards");
    mockGetApiUser.mockResolvedValueOnce({ id: "human-1", username: "landon" });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_agent: false, is_anonymous: false }], rowCount: 1 });
    mockGetPersonalTeamForUser.mockResolvedValueOnce({
      id: "personal-team-9",
      name: "Personal",
      is_personal: true,
      created_at: "",
    });

    const response = (await action({
      request: req({ title: "My Board", columns: [] }),
      params: {},
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(201);
    const json = (await response.json()) as { team_id: string };
    expect(json.team_id).toBe("personal-team-9");
    expect(mockGetPersonalTeamForUser).toHaveBeenCalledWith("human-1");
    expect(mockCreateBoardWithColumns).toHaveBeenCalledWith(
      "My Board",
      [],
      "human-1",
      "personal-team-9"
    );
  });

  it("does not attach a personal team for an agent or anonymous caller with no teamId", async () => {
    const { action } = await import("./boards");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-legacy-1", username: "Agent" });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ is_agent: true, is_anonymous: true }], rowCount: 1 });

    const response = (await action({
      request: req({ title: "Agent Board", columns: [] }),
      params: {},
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(201);
    expect(mockGetPersonalTeamForUser).not.toHaveBeenCalled();
    expect(mockCreateBoardWithColumns).toHaveBeenCalledWith(
      "Agent Board",
      [],
      "agent-legacy-1",
      null
    );
  });

  it("rejects missing title with 400", async () => {
    const { action } = await import("./boards");
    const response = (await action({
      request: req({ columns: [] }),
      params: {},
      context: {},
    } as never)) as Response;
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects malformed JSON with 400", async () => {
    const { action } = await import("./boards");
    const request = new Request("http://localhost:3000/api/v1/boards", {
      method: "POST",
      body: "not-json{",
    });
    const response = (await action({ request, params: {}, context: {} } as never)) as Response;
    expect(response.status).toBe(400);
  });

  it("rejects column missing title", async () => {
    const { action } = await import("./boards");
    const response = (await action({
      request: req({
        title: "X",
        columns: [{ title: "" }],
      }),
      params: {},
      context: {},
    } as never)) as Response;
    expect(response.status).toBe(400);
  });

  it("rejects GET with 405", async () => {
    const { loader } = await import("./boards");
    const response = loader() as Response;
    expect(response.status).toBe(405);
  });
});

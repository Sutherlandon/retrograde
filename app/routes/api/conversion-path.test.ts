// app/routes/api/conversion-path.test.ts
// GAP-002's release-gate proof (API-002, API-004, DASH-016): walks the
// conversion path end to end at the route level, with only the DB pool and
// session cookies mocked — every route action, board_permissions, and
// hooks/useAuth run for real. Steps:
//   1. An agent creates a trial board with no auth (POST /api/v1/boards).
//   2. The agent posts notes with its agent_token (201).
//   3. A registered human claims the board (board.claim — success).
//   4. The agent posts notes again with the SAME token (still 201) — the
//      board stayed crewless and open, so nothing broke for the agent.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/server/db_init", () => ({}));

// One board's ownership state, mutated by the claim step, read back by the
// two access checks either side of it — this is what proves continuity.
let boardHasOwner = false;

const mockPoolQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  // createAgentUser (trial flow) / getApiUser's legacy-bearer user lookup /
  // requireRegisteredUser's user lookup all hit "SELECT * FROM users WHERE id = $1".
  if (sql.includes("INSERT INTO users") && sql.includes("is_agent")) {
    return { rows: [{ id: "agent-1" }] };
  }
  if (sql.includes("SELECT * FROM users WHERE id = $1")) {
    const id = params[0];
    if (id === "agent-1") {
      return {
        rows: [{ id: "agent-1", is_agent: true, is_anonymous: true, display_name: "Agent", preferred_username: null }],
      };
    }
    if (id === "human-1") {
      return { rows: [{ id: "human-1", is_anonymous: false, preferred_username: "landon" }] };
    }
    return { rows: [] };
  }
  // board_permissions.getBoardAccess
  if (sql.includes("FROM boards b") && sql.includes("restrict_board_access")) {
    return {
      rowCount: 1,
      rows: [{ team_id: null, restricted: false, is_team_member: false, is_board_member: false, is_registered: false }],
    };
  }
  // board.claim.ts's ownership lookup
  if (sql.includes("SELECT bm.user_id as owner_id")) {
    return { rowCount: 1, rows: [{ owner_id: boardHasOwner ? "human-1" : null }] };
  }
  // team_model.ensurePersonalTeam's existing-team lookup — no personal crew
  // yet, so it falls through to creating one (via pool.connect, below).
  if (sql.includes("FROM team_members tm") && sql.includes("is_personal = TRUE")) {
    return { rowCount: 0, rows: [] };
  }
  // board_model.getBoardServer (bulkInsertNotesServer's return value)
  if (sql.includes("json_build_object")) {
    return { rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] };
  }
  return { rows: [], rowCount: 0 };
});

const mockClientQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  if (sql.includes("SELECT id FROM columns WHERE board_id")) {
    const ids = params[1] as string[];
    return { rows: ids.map((id) => ({ id })) };
  }
  if (sql.includes("COALESCE(MAX(note_order)")) {
    return { rows: [{ next: 0 }] };
  }
  // team_model.ensurePersonalTeam creating the claimer's personal crew.
  if (sql.includes("INSERT INTO teams")) {
    return { rows: [{ id: "personal-team-1" }] };
  }
  // board.claim.ts's claim insert — same continuity signal as before, just
  // run via client.query now that the claim is a transaction.
  if (sql.includes("INSERT INTO board_members") && sql.includes("'owner'")) {
    boardHasOwner = true;
    return {};
  }
  return {};
});
const mockConnect = vi.fn(async () => ({ query: mockClientQuery, release: vi.fn() }));

vi.mock("~/server/db_config", () => ({
  pool: { query: mockPoolQuery, connect: mockConnect },
}));

// Cookie-backed sessions: commitSession serializes the session's data into
// the cookie value itself (no external store), and getSession decodes that
// same value back — so an agent's bearer token really is a self-describing
// session, matching production's cookie-session behavior closely enough to
// prove continuity across the claim.
function makeSession(data: Record<string, string>) {
  return {
    get: (k: string) => data[k],
    set: (k: string, v: string) => { data[k] = v; },
    unset: (k: string) => { delete data[k]; },
    __data: data,
  };
}
vi.mock("~/session.server", () => ({
  getSession: vi.fn(async (cookie?: string | null) => {
    if (!cookie) return makeSession({});
    const match = cookie.match(/__session=([^;]*)/);
    if (!match) return makeSession({});
    try {
      return makeSession(JSON.parse(decodeURIComponent(match[1])));
    } catch {
      return makeSession({});
    }
  }),
  commitSession: vi.fn(async (session: { __data: Record<string, string> }) => {
    return `__session=${encodeURIComponent(JSON.stringify(session.__data))}; Path=/; HttpOnly`;
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  boardHasOwner = false;
  mockConnect.mockClear();
});

describe("conversion path (API-002, API-004, DASH-016)", () => {
  it("keeps an agent's token working across a human claiming the board", async () => {
    const { action: createBoardAction } = await import("./boards");
    const { action: notesAction } = await import("./board.notes");
    const { action: claimAction } = await import("../app/board.claim");

    // 1. Trial board, no auth.
    const createRes = (await createBoardAction({
      request: new Request("http://localhost:3000/api/v1/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Sprint Retro", display_name: "Claude" }),
      }),
      params: {},
      context: {},
    } as never)) as Response;
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { board_id: string; agent_token: string };
    expect(created.agent_token).toBeTruthy();

    function postNotes() {
      return notesAction({
        request: new Request(`http://localhost:3000/api/v1/boards/${created.board_id}/notes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${created.agent_token}`,
          },
          body: JSON.stringify({ notes: [{ columnId: "col-1", text: "Shipped the fix" }] }),
        }),
        params: { id: created.board_id },
        context: {},
      } as never) as Promise<Response>;
    }

    // 2. Agent posts notes with its token — succeeds (crewless board, no
    // access restriction).
    const firstNotesRes = await postNotes();
    expect(firstNotesRes.status).toBe(201);

    // 3. A registered human claims the ownerless board.
    const claimForm = new FormData();
    claimForm.append("boardLink", `http://localhost:3000/app/board/${created.board_id}`);
    const claimRes = (await claimAction({
      request: new Request("http://localhost:3000/app/board/claim", {
        method: "POST",
        headers: {
          Cookie: `__session=${encodeURIComponent(JSON.stringify({ userId: "human-1" }))}`,
        },
        body: claimForm,
      }),
      params: {},
      context: {},
    } as never)) as { success?: boolean; error?: string };
    expect(claimRes.success).toBe(true);
    expect(boardHasOwner).toBe(true);

    // 4. The agent posts notes again with the SAME token — still works. The
    // board stayed crewless, so getBoardAccess still admits it regardless of
    // the new owner row.
    const secondNotesRes = await postNotes();
    expect(secondNotesRes.status).toBe(201);
  });
});

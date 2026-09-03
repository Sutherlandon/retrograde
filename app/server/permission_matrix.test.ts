// app/server/permission_matrix.test.ts
// The permission matrix (docs/plans/0006-close-the-tier-model.md Part C / ADR-0011
// §8): every server-enforced registry action × every actor × every board-tier
// fixture resolves to an explicit allow or deny. A missing cell is a failing
// test, not a skipped one — see the completeness test below.
//
// Mocking style: `pool.query`/`pool.connect` and the session layer are mocked;
// board_permissions.ts, hooks/useAuth.ts, and the guard-relevant parts of
// team_model.ts / admin_model.ts run for real against the mocked SQL. Model
// mutations that aren't part of a guard (note/column/settings/timer writes,
// attachment/action-item/api-key CRUD) are mocked at the module level to
// sentinels — see app/server/permission_matrix.fixtures.ts for the full
// actor/fixture/resolver/catalogue machinery.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ACTORS, FIXTURES, FIXTURE_DATA, ACTION_CATALOG, SITE_ADMIN_EXTERNAL_ID,
  actorState, makeResolver, lockedVariant,
  type ActorId, type BoardFixtureId, type ActorState, type FixtureState, type Verdict,
} from "./permission_matrix.fixtures";
import { parseRegistry, isServerEnforced, MATRIX_EXTRA_EXCLUDED_IDS } from "./registry_parser";
import path from "path";

// ---------------------------------------------------------------------------
// registry_linkage.test.ts finds coverage by grepping *.test.ts file TEXT for
// registry IDs — it has no visibility into ACTION_CATALOG (an imported data
// structure) or the `it.each` cell names built from it at runtime. This
// comment is the literal anchor: every ID this suite's matrix genuinely
// covers, kept in sync with ACTION_CATALOG by the completeness test below.
//
// BRD-001, BRD-002, BRD-003, BRD-004, BRD-005, BRD-006, BRD-007, BRD-008,
// BRD-009, BRD-010, BRD-011, BRD-012, BRD-013, BRD-014, BRD-019,
// DECK-002, DECK-003, DECK-006, DECK-008, DECK-009, DECK-010, DECK-011,
// DECK-012, DECK-013, DECK-014, DECK-015, DECK-016, DECK-017, DECK-018,
// DECK-019, DECK-020, DECK-021, DECK-022, DECK-023, DECK-024, DECK-025,
// DASH-001, DASH-003, DASH-006, DASH-007, DASH-008, DASH-009, DASH-010,
// DASH-011, DASH-012, DASH-016,
// CREW-001, CREW-002, CREW-003, CREW-004, CREW-005, CREW-006, CREW-007,
// CREW-008, CREW-009, CREW-019, CREW-011, CREW-012, CREW-014, CREW-015,
// CREW-016, CREW-017,
// ADMIN-001, ADMIN-004, ADMIN-005,
// API-003, API-004, API-005

// ---------------------------------------------------------------------------
// Mocks — pool.query/connect delegate to whatever resolver is currently set;
// each invocation reassigns it for the actor+fixture under test.
// ---------------------------------------------------------------------------

let currentResolver: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;

vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: [string, unknown[]?]) => currentResolver(...args),
    connect: async () => ({
      query: (...args: [string, unknown[]?]) => currentResolver(...args),
      release: () => {},
    }),
  },
  siteAdminIds: [SITE_ADMIN_EXTERNAL_ID],
  cronSecret: "test-cron-secret",
}));

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async (cookieHeader?: string | null) => {
    const match = cookieHeader?.match(/uid\.([^;]+)/);
    const uid = match ? match[1] : undefined;
    return {
      get: (key: string) => (key === "userId" ? uid : undefined),
      set: () => {},
      unset: () => {},
    };
  }),
  commitSession: vi.fn(async () => "cookie-value"),
}));

vi.mock("~/config/siteConfig", () => ({
  siteConfig: { usernameField: "preferred_username" },
}));

vi.mock("~/server/db_init", () => ({}));

// board_model.ts: keep the DASH-006..012 lifecycle functions (and createBoard,
// used by DASH-003/CREW-012) real — their guard is inline SQL, not a separate
// checkable function. Everything else is a sentinel so "allow" is observable
// as "no permission Response was thrown", matching the brief's model.
vi.mock("~/server/board_model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/board_model")>();
  const sentinel = vi.fn(async () => ({ ok: true }));
  return {
    ...actual,
    getBoardServer: sentinel,
    upsertNoteServer: sentinel, likeNoteServer: sentinel, voteNoteServer: sentinel,
    deleteNoteServer: sentinel, moveNoteServer: sentinel, reorderNotesServer: sentinel,
    addColumnServer: sentinel, updateColumnTitleServer: sentinel,
    updateColumnPromptServer: sentinel, deleteColumnServer: sentinel,
    updateBoardTitleServer: sentinel, updateBoardSettingsServer: sentinel,
    clearBoardVotesServer: sentinel, startTimerServer: sentinel, stopTimerServer: sentinel,
    listVisibleBoards: vi.fn(async () => []),
    listFacilitatorsServer: vi.fn(async () => []),
    addFacilitatorServer: sentinel, removeFacilitatorServer: sentinel,
    setOpenFacilitationServer: vi.fn(async () => true),
    getOpenFacilitationServer: vi.fn(async () => false),
    bulkInsertNotesServer: vi.fn(async () => ({ id: "board-1" })),
  };
});

vi.mock("~/server/attachment_model", () => ({
  getAttachmentsServer: vi.fn(async () => []),
  addLinkAttachmentServer: vi.fn(async () => ({ ok: true })),
  addImageAttachmentServer: vi.fn(async () => ({ ok: true })),
  deleteAttachmentServer: vi.fn(async () => ({ ok: true })),
}));

vi.mock("~/server/action_item_model", () => ({
  createBoardActionItem: vi.fn(async () => ({ ok: true })),
  updateActionItemText: vi.fn(async () => ({ ok: true })),
  setActionItemCompleted: vi.fn(async () => ({ ok: true })),
  deleteActionItemServer: vi.fn(async () => ({ ok: true })),
  bulkCreateBoardActionItems: vi.fn(async () => ({ id: "board-1" })),
  listOpenActionItemsForTeam: vi.fn(async () => []),
  createTeamActionItem: vi.fn(async () => ({ ok: true })),
  setTeamActionItemCompleted: vi.fn(async () => ({ ok: true })),
  updateTeamActionItemText: vi.fn(async () => ({ ok: true })),
  deleteTeamActionItem: vi.fn(async () => ({ ok: true })),
  listOpenActionItemsForUser: vi.fn(async () => []),
}));

class MockApiKeyLimitError extends Error {}
vi.mock("~/server/api_key", async (importOriginal) => {
  // isApiKey/findApiKeyByValue/hashApiKey are used directly by hooks/useAuth.ts's
  // getApiUser — keep those real (findApiKeyByValue is a thin pool.query wrapper
  // the resolver already answers); only crew-mutation functions are sentinels.
  const actual = await importOriginal<typeof import("~/server/api_key")>();
  return {
    ...actual,
    listApiKeysForTeam: vi.fn(async () => []),
    mintApiKey: vi.fn(async () => ({ key: "rk_live_sentinel", apiKey: { display_name: "sentinel" } })),
    revokeApiKey: vi.fn(async () => undefined),
    ApiKeyLimitError: MockApiKeyLimitError,
  };
});

// team_model.ts: keep teamRole / getTeamWithMembers / getPersonalTeamForUser /
// userIsTeamMember real (they ARE the CREW-*/DASH-003 guards). Mutations are
// sentinels.
vi.mock("~/server/team_model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/team_model")>();
  return {
    ...actual,
    createTeam: vi.fn(async () => "team-new"),
    renameTeam: vi.fn(async () => undefined),
    deleteTeamServer: vi.fn(async () => undefined),
    setTeamBoardRestriction: vi.fn(async () => undefined),
    addTeamMember: vi.fn(async () => undefined),
    removeTeamMember: vi.fn(async () => undefined),
    listTeamsForUser: vi.fn(async () => []),
    listTeamBoards: vi.fn(async () => []),
    ensurePersonalTeam: vi.fn(async () => "team-personal-fallback"),
  };
});

vi.mock("~/server/metrics_model", () => ({
  getMetrics: vi.fn(async () => ({ registeredUsers: 0, totalNotes: 0, activeBoards: 0, engagedUsers: 0 })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Classification — see ActionSpec's doc comment in fixtures.ts for why two
// board-lifecycle routes need denyOnPlainError / denyWhenResult.
// ---------------------------------------------------------------------------

const DENY_STATUSES = new Set([401, 403, 404, 423]);

function isLoginRedirect(res: Response): boolean {
  return res.status === 302 && (res.headers.get("Location") ?? "").includes("/auth/login");
}

function classifyResponse(res: Response, specId: string): Verdict {
  if (res.status === 302) return isLoginRedirect(res) ? "deny" : "allow";
  if (res.status >= 200 && res.status < 300) return "allow";
  if (DENY_STATUSES.has(res.status)) return "deny";
  throw new Error(`[${specId}] unexpected response status ${res.status}`);
}

async function classify(
  specId: string,
  run: () => Promise<unknown>,
  denyOnPlainError?: boolean,
  denyWhenResult?: (result: unknown) => boolean
): Promise<Verdict> {
  try {
    const result = await run();
    if (result instanceof Response) return classifyResponse(result, specId);
    if (denyWhenResult?.(result)) return "deny";
    return "allow";
  } catch (err) {
    if (err instanceof Response) return classifyResponse(err, specId);
    if (denyOnPlainError && err instanceof Error) return "deny";
    throw err;
  }
}

async function invoke(
  specId: string, actor: ActorState, fixture: FixtureState
): Promise<Verdict> {
  const spec = ACTION_CATALOG.find((s) => s.id === specId)!;
  currentResolver = makeResolver(actor, fixture);
  const mod = await spec.module();
  const { request, params } = spec.build(actor, fixture);
  const handler = (spec.kind === "loader" ? mod.loader : mod.action) as (
    args: unknown
  ) => Promise<unknown>;
  return classify(
    specId,
    () => handler({ request, params, context: {} } as never),
    spec.denyOnPlainError,
    spec.denyWhenResult
  );
}

// ---------------------------------------------------------------------------
// The expectations matrix — every cell computed from the same rule the real
// guard implements (see RULES in fixtures.ts), so it is complete by
// construction and cross-checked against the registry below.
// ---------------------------------------------------------------------------

type Expectations = Record<string, Record<ActorId, Record<BoardFixtureId, Verdict>>>;

const expectations: Expectations = Object.fromEntries(
  ACTION_CATALOG.map((spec) => [
    spec.id,
    Object.fromEntries(
      ACTORS.map((actorId) => [
        actorId,
        Object.fromEntries(
          FIXTURES.map((fixtureId) => {
            const fixture = FIXTURE_DATA[fixtureId];
            return [fixtureId, spec.rule(actorState(actorId, fixture), fixture)];
          })
        ) as Record<BoardFixtureId, Verdict>,
      ])
    ) as Record<ActorId, Record<BoardFixtureId, Verdict>>,
  ])
) as Expectations;

describe("permission matrix completeness", () => {
  const repoRoot = path.resolve(__dirname, "../..");
  const registryRows = parseRegistry(repoRoot);
  const requiredIds = registryRows
    .filter(isServerEnforced)
    .map((r) => r.id)
    .filter((id) => !MATRIX_EXTRA_EXCLUDED_IDS.has(id));
  const catalogIds = new Set(ACTION_CATALOG.map((s) => s.id));

  it("enumerates every server-enforced registry ID (minus documented exclusions)", () => {
    const missing = requiredIds.filter((id) => !catalogIds.has(id));
    expect(missing, `Registry IDs not enumerated in ACTION_CATALOG: ${missing.join(", ")}`).toEqual([]);
  });

  it("has an expectation for every actor × fixture combination, for every action", () => {
    for (const spec of ACTION_CATALOG) {
      for (const actor of ACTORS) {
        for (const fixture of FIXTURES) {
          const verdict = expectations[spec.id]?.[actor]?.[fixture];
          expect(
            verdict === "allow" || verdict === "deny",
            `Missing expectation: ${spec.id} / ${actor} / ${fixture}`
          ).toBe(true);
        }
      }
    }
  });

  it(`covers ${ACTION_CATALOG.length} actions × ${ACTORS.length} actors × ${FIXTURES.length} fixtures = ${
    ACTION_CATALOG.length * ACTORS.length * FIXTURES.length
  } cells`, () => {
    expect(ACTION_CATALOG.length).toBeGreaterThan(0);
  });
});

describe("permission matrix", () => {
  const cells = ACTION_CATALOG.flatMap((spec) =>
    ACTORS.flatMap((actor) =>
      FIXTURES.map((fixture) => ({
        name: `${spec.id} / ${actor} / ${fixture} => ${expectations[spec.id][actor][fixture]}`,
        id: spec.id,
        actor,
        fixture,
        expected: expectations[spec.id][actor][fixture],
      }))
    )
  );

  it.each(cells)("$name", async ({ id, actor, fixture, expected }) => {
    const verdict = await invoke(id, actorState(actor, FIXTURE_DATA[fixture]), FIXTURE_DATA[fixture]);
    expect(verdict).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Lock variants (Item 1: "Plus lock variants where a row's guard mentions
// requireUnlocked") — a facilitator/owner does NOT bypass a lock. Spot-checked
// on the `personal` fixture (facilitator/board-owner actors) rather than
// exploded across the full actor×fixture grid, per board_permissions.ts's
// own lock matrix comment.
// ---------------------------------------------------------------------------

describe("lock enforcement (requireUnlocked) is not bypassed by role", () => {
  const notesLockedFixture = lockedVariant(FIXTURE_DATA.personal, { notes: true });
  const boardLockedFixture = lockedVariant(FIXTURE_DATA.personal, { board: true });

  const notesLockedCases: [string, ActorId][] = [
    ["BRD-004", "board-owner"], ["BRD-005", "facilitator"], ["BRD-006", "board-owner"],
    ["BRD-007", "facilitator"], ["BRD-008", "board-owner"], ["BRD-011", "facilitator"],
  ];
  it.each(notesLockedCases)("%s denies %s when notes are locked, even though the role would otherwise allow it", async (id, actor) => {
    const verdict = await invoke(id, actorState(actor, notesLockedFixture), notesLockedFixture);
    expect(verdict).toBe("deny");
  });

  const boardLockedCases: [string, ActorId][] = [
    ["BRD-003", "facilitator"], ["BRD-009", "board-owner"], ["BRD-010", "facilitator"],
    ["BRD-012", "facilitator"], ["BRD-013", "board-owner"],
    ["DECK-002", "facilitator"], ["DECK-003", "board-owner"], ["DECK-006", "facilitator"],
    ["DECK-023", "board-owner"], ["DECK-024", "facilitator"], ["DECK-025", "board-owner"],
  ];
  it.each(boardLockedCases)("%s denies %s when the board is locked, even though the role would otherwise allow it", async (id, actor) => {
    const verdict = await invoke(id, actorState(actor, boardLockedFixture), boardLockedFixture);
    expect(verdict).toBe("deny");
  });

  it("DECK-008 (settings) is NOT blocked by board_locked — settings are how a board unlocks", async () => {
    const verdict = await invoke("DECK-008", actorState("facilitator", boardLockedFixture), boardLockedFixture);
    expect(verdict).toBe("allow");
  });
});

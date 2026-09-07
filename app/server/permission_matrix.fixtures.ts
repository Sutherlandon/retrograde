// app/server/permission_matrix.fixtures.ts
// Fixture builders, actor state, and the SQL resolver for permission_matrix.test.ts
// (docs/plans/0006-close-the-tier-model.md Part C). Kept separate so each piece
// stays under the 150-line function limit and the test file reads as the matrix,
// not the plumbing.
//
// The model: three board fixtures matching the tier model (ADR-0011), twelve
// actors, and a `pool.query` resolver that answers every SQL shape the real
// guards in board_permissions.ts / hooks/useAuth.ts / team_model.ts /
// admin_model.ts / board_model.ts (lifecycle functions) issue, driven purely by
// the actor+fixture state — no route-specific mocking of the guards themselves.

export type ActorId =
  | "anonymous-no-session"
  | "anonymous-with-session"
  | "registered-non-member"
  | "board-member"
  | "facilitator"
  | "board-owner"
  | "crew-member"
  | "crew-owner"
  | "api-key-in-crew"
  | "api-key-out-of-crew"
  | "granted-admin"
  | "site-admin";

export const ACTORS: ActorId[] = [
  "anonymous-no-session",
  "anonymous-with-session",
  "registered-non-member",
  "board-member",
  "facilitator",
  "board-owner",
  "crew-member",
  "crew-owner",
  "api-key-in-crew",
  "api-key-out-of-crew",
  "granted-admin",
  "site-admin",
];

export type BoardFixtureId = "anonymous" | "personal" | "members-only";
export const FIXTURES: BoardFixtureId[] = ["anonymous", "personal", "members-only"];

export const SITE_ADMIN_EXTERNAL_ID = "site-admin-ext-1";
export const OTHER_TEAM_ID = "team-other-crew"; // an API key's crew that never matches a fixture

export interface FixtureState {
  id: BoardFixtureId;
  boardId: string;
  teamId: string | null;
  isPersonal: boolean;
  restricted: boolean;
  openFacilitation: boolean;
  notesLocked: boolean;
  boardLocked: boolean;
}

// Matches ADR-0011 / the registry's tier table exactly:
//   anonymous:     crewless, no owner possible, open_facilitation TRUE.
//   personal:      personal crew, restrict_board_access forced FALSE (ADR-0010).
//   members-only:  named crew, restrict_board_access TRUE (the default).
export const FIXTURE_DATA: Record<BoardFixtureId, FixtureState> = {
  anonymous: {
    id: "anonymous", boardId: "board-anonymous", teamId: null, isPersonal: false,
    restricted: false, openFacilitation: true, notesLocked: false, boardLocked: false,
  },
  personal: {
    id: "personal", boardId: "board-personal", teamId: "team-personal", isPersonal: true,
    restricted: false, openFacilitation: false, notesLocked: false, boardLocked: false,
  },
  "members-only": {
    id: "members-only", boardId: "board-members-only", teamId: "team-crew", isPersonal: false,
    restricted: true, openFacilitation: false, notesLocked: false, boardLocked: false,
  },
};

/** A locked variant of a fixture, for the requireUnlocked spot-checks. */
export function lockedVariant(
  fixture: FixtureState,
  flags: { notes?: boolean; board?: boolean }
): FixtureState {
  return { ...fixture, notesLocked: !!flags.notes, boardLocked: !!flags.board };
}

export interface ActorState {
  id: ActorId;
  userId: string | null;
  externalId: string | null;
  isAnonymousUser: boolean;
  hasSessionCookie: boolean;
  boardRole: "owner" | "facilitator" | "member" | null;
  teamRole: "owner" | "member" | null;
  isApiKeyAuth: boolean;
  apiKeyTeamId: string | null;
  isGrantedAdmin: boolean;
  isSiteAdmin: boolean;
}

/**
 * Build an actor's identity. Deliberately independent of the fixture except
 * for API-key actors, whose key is scoped to a specific crew (in vs. out).
 *
 * board-owner also carries teamRole "owner" — realistic (whoever owns a
 * board on a crew got there by being a member of it) and what makes DASH-010
 * (move requires owner + destination membership) a meaningful, not-vacuous
 * check instead of one that can never pass.
 */
export function actorState(actor: ActorId, fixture: FixtureState): ActorState {
  const uid = `uid-${actor}`;
  const base: ActorState = {
    id: actor, userId: uid, externalId: `ext-${actor}`,
    isAnonymousUser: false, hasSessionCookie: true,
    boardRole: null, teamRole: null,
    isApiKeyAuth: false, apiKeyTeamId: null,
    isGrantedAdmin: false, isSiteAdmin: false,
  };

  switch (actor) {
    case "anonymous-no-session":
      return { ...base, userId: null, hasSessionCookie: false };
    case "anonymous-with-session":
      return { ...base, isAnonymousUser: true };
    case "registered-non-member":
      return base;
    case "board-member":
      return { ...base, boardRole: "member" };
    case "facilitator":
      return { ...base, boardRole: "facilitator" };
    case "board-owner":
      return { ...base, boardRole: "owner", teamRole: "owner" };
    case "crew-member":
      return { ...base, teamRole: "member" };
    case "crew-owner":
      return { ...base, teamRole: "owner" };
    case "api-key-in-crew":
      return {
        ...base, userId: `${uid}-agent`, isAnonymousUser: true, hasSessionCookie: false,
        isApiKeyAuth: true, apiKeyTeamId: fixture.teamId,
      };
    case "api-key-out-of-crew":
      return {
        ...base, userId: `${uid}-agent`, isAnonymousUser: true, hasSessionCookie: false,
        isApiKeyAuth: true, apiKeyTeamId: OTHER_TEAM_ID,
      };
    case "granted-admin":
      return { ...base, isGrantedAdmin: true };
    case "site-admin":
      return { ...base, isSiteAdmin: true, externalId: SITE_ADMIN_EXTERNAL_ID };
  }
}

// ---------------------------------------------------------------------------
// Shared predicates — one place encoding what each real guard actually does,
// used both by the resolver (to answer SQL) and by the expectation rules (to
// know what "allow" should mean) so the two never drift apart by accident.
// ---------------------------------------------------------------------------

/** getBoardAccess's `allowed` column. */
export function hasBoardAccess(actor: ActorState, fixture: FixtureState): boolean {
  if (!fixture.teamId) return true;
  if (!fixture.restricted) return true;
  if (actor.boardRole !== null) return true;
  if (actor.teamRole !== null) return true;
  if (actor.isApiKeyAuth && actor.apiKeyTeamId === fixture.teamId) return true;
  return false;
}

/** requireRegisteredUser: session cookie present and not an anonymous user. */
export function isRegisteredHuman(actor: ActorState): boolean {
  return actor.hasSessionCookie && !actor.isAnonymousUser;
}

/** getOptionalUser resolving to a non-null user (session cookie only). */
export function hasSession(actor: ActorState): boolean {
  return actor.hasSessionCookie;
}

/** userCanFacilitate, given whatever userId the caller resolved to. */
export function canFacilitateDirect(actor: ActorState, fixture: FixtureState): boolean {
  if (fixture.openFacilitation) return true;
  return actor.boardRole === "owner" || actor.boardRole === "facilitator";
}

/**
 * requireFacilitator specifically: it resolves the caller via getOptionalUser
 * (session cookie only — NOT getApiUser), so an API-key actor is only ever
 * admitted through open_facilitation, never through a board_members role.
 */
export function canFacilitateViaSession(actor: ActorState, fixture: FixtureState): boolean {
  if (fixture.openFacilitation) return true;
  if (!actor.hasSessionCookie) return false;
  return actor.boardRole === "owner" || actor.boardRole === "facilitator";
}

/** getApiUser resolves to a non-null caller (bearer key OR session cookie). */
export function hasApiIdentity(actor: ActorState): boolean {
  return actor.hasSessionCookie || actor.isApiKeyAuth;
}

// ---------------------------------------------------------------------------
// SQL resolver — answers every `pool.query` / `client.query` shape the real
// guards and the (unmocked) model-layer guard functions issue, for a single
// actor+fixture pair. A fresh resolver is built per invocation, so it never
// needs to disambiguate between two different actors in one call.
// ---------------------------------------------------------------------------

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();

function userRow(actor: ActorState) {
  return {
    id: actor.userId,
    external_id: actor.externalId,
    preferred_username: actor.id,
    display_name: actor.id,
    is_anonymous: actor.isAnonymousUser,
  };
}

// Split out of makeResolver to stay under the 150-line function limit — each
// handles one family of query shapes and returns undefined to fall through.
function resolveIdentityQueries(s: string, params: unknown[], actor: ActorState): QueryResult | undefined {
  if (s === "SELECT * FROM users WHERE id = $1") {
    return params[0] === actor.userId ? { rowCount: 1, rows: [userRow(actor)] } : { rowCount: 0, rows: [] };
  }
  if (s === "SELECT external_id FROM users WHERE id = $1") {
    return params[0] === actor.userId
      ? { rowCount: 1, rows: [{ external_id: actor.externalId }] }
      : { rowCount: 0, rows: [] };
  }
  if (s.includes("FROM api_keys WHERE key_hash")) {
    if (!actor.isApiKeyAuth) return { rowCount: 0, rows: [] };
    return {
      rowCount: 1,
      rows: [{ id: "api-key-1", team_id: actor.apiKeyTeamId, agent_user_id: actor.userId, revoked_at: null }],
    };
  }
  if (s.startsWith("UPDATE api_keys SET last_used_at")) return { rowCount: 0, rows: [] };
  if (s.includes("preferred_username = $1 AND is_anonymous = FALSE")) {
    // findRegisteredUserByUsername — permission-irrelevant; always resolves so
    // routes that grant/add-member by username reach their real guard first.
    return { rowCount: 1, rows: [{ id: "target-user-1", username: "target" }] };
  }
  if (s.includes("FROM admin_users WHERE user_id")) {
    return actor.isGrantedAdmin ? { rowCount: 1, rows: [{ "?column?": 1 }] } : { rowCount: 0, rows: [] };
  }
  if (s === "SELECT subscription_status FROM users WHERE id = $1") {
    // entitlements.ts (CREW-002, GAP-005/ADR-0013): the matrix's expectation
    // model for CREW-002 is RULES.registeredOnly — every registered human is
    // entitled here, matching that model, not a real billing state.
    return params[0] === actor.userId && isRegisteredHuman(actor)
      ? { rowCount: 1, rows: [{ subscription_status: "active" }] }
      : { rowCount: 0, rows: [] };
  }
  return undefined;
}

function resolveBoardGuardQueries(
  s: string, params: unknown[], fixture: FixtureState, actor: ActorState
): QueryResult | undefined {
  // getBoardAccess (board_permissions.ts)
  if (s.includes("is_team_member") && s.includes("is_board_member") && s.includes("is_registered")) {
    return {
      rowCount: 1,
      rows: [{
        team_id: fixture.teamId,
        restricted: fixture.restricted,
        is_team_member: fixture.teamId !== null && actor.teamRole !== null,
        is_board_member: actor.boardRole !== null,
        is_registered: isRegisteredHuman(actor) && !actor.isApiKeyAuth,
      }],
    };
  }
  // userCanFacilitate (board_permissions.ts)
  if (s.includes("open_facilitation") && s.includes("AS can")) {
    const userIdParam = params[1];
    const can =
      fixture.openFacilitation ||
      (userIdParam === actor.userId && (actor.boardRole === "owner" || actor.boardRole === "facilitator"));
    return { rowCount: 1, rows: [{ can }] };
  }
  // requireUnlocked (board_permissions.ts)
  if (s.startsWith("SELECT notes_locked, board_locked")) {
    return { rowCount: 1, rows: [{ notes_locked: fixture.notesLocked, board_locked: fixture.boardLocked }] };
  }
  return undefined;
}

function resolveMembershipQueries(
  s: string, params: unknown[], fixture: FixtureState, actor: ActorState
): QueryResult | undefined {
  // board_members role lookup — duplicateBoardServer / deleteBoardServer /
  // archiveBoardServer / unarchiveBoardServer all issue this exact text.
  if (s === "SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2") {
    return actor.boardRole ? { rowCount: 1, rows: [{ role: actor.boardRole }] } : { rowCount: 0, rows: [] };
  }
  // duplicateBoardServer: the ORIGINAL board's team_id
  if (s === "SELECT team_id FROM boards WHERE id = $1") {
    return { rowCount: 1, rows: [{ team_id: fixture.teamId }] };
  }
  // duplicateBoardServer: is the caller a member of the original's crew?
  if (s === "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2") {
    return actor.teamRole !== null ? { rowCount: 1, rows: [{ "?column?": 1 }] } : { rowCount: 0, rows: [] };
  }
  // team_model.teamRole
  if (s === "SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2") {
    return actor.teamRole ? { rowCount: 1, rows: [{ role: actor.teamRole }] } : { rowCount: 0, rows: [] };
  }
  // team_model.getPersonalTeamForUser
  if (s.includes("t.is_personal = TRUE") && s.includes("JOIN team_members")) {
    return {
      rowCount: 1,
      rows: [{ id: "team-personal-fallback", name: "Personal", is_personal: true, created_at: "2026-01-01" }],
    };
  }
  // team_model.getTeamWithMembers — the team row itself
  if (s.startsWith("SELECT id, name, is_personal, created_at, restrict_board_access FROM teams")) {
    if (!fixture.teamId || params[0] !== fixture.teamId) return { rowCount: 0, rows: [] };
    return {
      rowCount: 1,
      rows: [{ id: fixture.teamId, name: "Crew", is_personal: fixture.isPersonal, created_at: "2026-01-01", restrict_board_access: fixture.restricted }],
    };
  }
  // team_model.getTeamWithMembers — the member list (content unused for gating)
  if (s.includes("FROM team_members tm") && s.includes("JOIN users u")) {
    return { rowCount: 0, rows: [] };
  }
  // duplicateBoardServer: the original board's title + voting settings, read
  // inside the transaction after the ownership/crew checks pass.
  if (s.startsWith("SELECT title, voting_enabled, voting_allowed, voting_scope")) {
    return { rowCount: 1, rows: [{ title: "Sprint 1", voting_enabled: false, voting_allowed: 1, voting_scope: "board" }] };
  }
  // duplicateBoardServer: copy the original's columns (content unused for gating)
  if (s.startsWith("SELECT title, col_order, prompt FROM columns")) {
    return { rowCount: 0, rows: [] };
  }
  // board.claim.ts — the board's current owner, if any. Not permission-gating
  // (requireRegisteredUser is the only real gate on that route) but answered
  // correctly for completeness: anonymous boards have no owner (ADR-0011).
  if (s.includes("owner_id") && s.includes("LEFT JOIN board_members")) {
    return { rowCount: 1, rows: [{ owner_id: fixture.teamId ? "some-other-owner" : null }] };
  }
  return undefined;
}

// DASH-010/011/012: moveBoardsToTeamServer and bulkDeleteBoardsServer embed
// their owner/membership checks INSIDE a single UPDATE/SELECT ... RETURNING
// statement (no separate guard query to intercept), so the resolver has to
// evaluate those conditions itself rather than deferring to a generic
// fallback — otherwise it would silently return zero rows for everyone,
// including an actual owner, and the matrix could never see "allow".
function resolveDashboardLifecycleQueries(
  s: string, params: unknown[], actor: ActorState
): QueryResult | undefined {
  const isOwner = actor.boardRole === "owner";
  const isTeamMember = actor.teamRole !== null; // destination team is abstract — see actorState's doc comment

  // moveBoardsToTeamServer (DASH-010/011): UPDATE ... WHERE EXISTS(owner) AND (teamId IS NULL OR EXISTS(team_members))
  if (s.includes("SET team_id = $2") && s.includes("open_facilitation = CASE")) {
    const boardIds = (params[0] as string[]) ?? [];
    const teamId = params[1] as string | null;
    const ok = isOwner && (teamId === null || isTeamMember);
    return ok ? { rowCount: boardIds.length, rows: boardIds.map((id) => ({ id })) } : { rowCount: 0, rows: [] };
  }

  // bulkDeleteBoardsServer (DASH-012): SELECT ids the caller owns, out of a given set.
  if (s.includes("JOIN board_members bm") && s.includes("bm.role = 'owner'") && s.includes("ANY($1)")) {
    const boardIds = (params[0] as string[]) ?? [];
    return isOwner ? { rowCount: boardIds.length, rows: boardIds.map((id) => ({ id })) } : { rowCount: 0, rows: [] };
  }

  return undefined;
}

/** Builds a fresh `pool.query`/`client.query` implementation for one actor+fixture pair. */
export function makeResolver(actor: ActorState, fixture: FixtureState) {
  return async function resolve(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const s = norm(sql);

    if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") return { rows: [], rowCount: 0 };

    return (
      resolveIdentityQueries(s, params, actor) ??
      resolveBoardGuardQueries(s, params, fixture, actor) ??
      resolveMembershipQueries(s, params, fixture, actor) ??
      resolveDashboardLifecycleQueries(s, params, actor) ??
      { rows: [], rowCount: 0 } // generic INSERT/UPDATE/DELETE — result unused by the guards under test
    );
  };
}

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

/** Cookie/Authorization headers for an actor. Session cookies are a synthetic
 *  `uid=<id>` format parsed by the `~/session.server` mock in the test file —
 *  no real cookie crypto needed since we control both sides. */
export function actorHeaders(actor: ActorState): Record<string, string> {
  if (actor.isApiKeyAuth) {
    return { Authorization: `Bearer rk_live_${actor.id}000000000000000000000000` };
  }
  if (actor.hasSessionCookie) {
    return { Cookie: `__session=uid.${actor.userId}` };
  }
  return {};
}

export function formRequest(
  url: string, method: string, actor: ActorState, fields: Record<string, string>
): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request(url, { method, headers: actorHeaders(actor), body: form });
}

export function jsonRequest(
  url: string, method: string, actor: ActorState, body: unknown
): Request {
  return new Request(url, {
    method,
    headers: { ...actorHeaders(actor), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getRequest(url: string, actor: ActorState): Request {
  return new Request(url, { method: "GET", headers: actorHeaders(actor) });
}

// ---------------------------------------------------------------------------
// Expectation rules — one function per distinct guard shape found in the
// route files. These mirror the real guards exactly (see the predicates
// above); the resolver answers SQL the same way so the two can't drift.
// ---------------------------------------------------------------------------

export type Verdict = "allow" | "deny";

export const RULES = {
  boardAccessOnly: (actor: ActorState, fixture: FixtureState): Verdict =>
    hasBoardAccess(actor, fixture) ? "allow" : "deny",

  // BRD-010 (vote): requireBoardAccess, then 401 if no session — via
  // getOptionalUser, so an API-key actor (no session cookie) is denied even
  // after passing board access.
  boardAccessThenSession: (actor: ActorState, fixture: FixtureState): Verdict =>
    hasBoardAccess(actor, fixture) && hasSession(actor) ? "allow" : "deny",

  facilitatorOnly: (actor: ActorState, fixture: FixtureState): Verdict =>
    canFacilitateViaSession(actor, fixture) ? "allow" : "deny",

  boardAccessThenFacilitator: (actor: ActorState, fixture: FixtureState): Verdict =>
    hasBoardAccess(actor, fixture) && canFacilitateViaSession(actor, fixture) ? "allow" : "deny",

  // BRD-014: board.action-items.ts's `complete` intent checks only for a
  // session — it never calls requireBoardAccess. Documented, not assumed.
  sessionOnly: (actor: ActorState): Verdict => (hasSession(actor) ? "allow" : "deny"),

  registeredOnly: (actor: ActorState): Verdict => (isRegisteredHuman(actor) ? "allow" : "deny"),

  crewView: (actor: ActorState, fixture: FixtureState): Verdict => {
    if (!isRegisteredHuman(actor)) return "deny";
    if (!fixture.teamId) return "deny";
    return actor.teamRole !== null ? "allow" : "deny";
  },

  crewMembership: (actor: ActorState, fixture: FixtureState): Verdict => {
    if (!isRegisteredHuman(actor)) return "deny";
    if (!fixture.teamId) return "deny";
    return actor.teamRole !== null ? "allow" : "deny";
  },

  crewOwner: (requireNonPersonal: boolean) => (actor: ActorState, fixture: FixtureState): Verdict => {
    if (!isRegisteredHuman(actor)) return "deny";
    if (!fixture.teamId) return "deny";
    if (actor.teamRole !== "owner") return "deny";
    if (requireNonPersonal && fixture.isPersonal) return "deny";
    return "allow";
  },

  dashboardOwner: (actor: ActorState): Verdict => {
    if (!isRegisteredHuman(actor)) return "deny";
    return actor.boardRole === "owner" ? "allow" : "deny";
  },

  dashboardMove: (actor: ActorState): Verdict => {
    if (!isRegisteredHuman(actor)) return "deny";
    return actor.boardRole === "owner" && actor.teamRole !== null ? "allow" : "deny";
  },

  siteAdmin: (actor: ActorState): Verdict => {
    if (!isRegisteredHuman(actor)) return "deny";
    return actor.isSiteAdmin ? "allow" : "deny";
  },

  adminDashboard: (actor: ActorState): Verdict => {
    if (!isRegisteredHuman(actor)) return "deny";
    return actor.isSiteAdmin || actor.isGrantedAdmin ? "allow" : "deny";
  },

  apiBoardAccess: (actor: ActorState, fixture: FixtureState): Verdict =>
    hasBoardAccess(actor, fixture) ? "allow" : "deny",

  apiBulkNotes: (actor: ActorState, fixture: FixtureState): Verdict => {
    if (!hasApiIdentity(actor)) return "deny";
    return hasBoardAccess(actor, fixture) ? "allow" : "deny";
  },

  apiFacilitate: (actor: ActorState, fixture: FixtureState): Verdict => {
    if (!hasApiIdentity(actor)) return "deny";
    if (!hasBoardAccess(actor, fixture)) return "deny";
    return canFacilitateDirect(actor, fixture) ? "allow" : "deny";
  },
};

// ---------------------------------------------------------------------------
// Action catalogue — every registry row whose guard is a real server-side
// check (BRD/DECK/DASH/CREW/ADMIN/API; excludes client-side, "none needed",
// "—", "inherits ...", and rows with no code path — see the report for the
// full list of exclusions and why). `module` is a thunk, not a static import,
// so it resolves AFTER the test file's vi.mock calls are in effect regardless
// of which file this thunk is defined in.
// ---------------------------------------------------------------------------

export interface ActionSpec {
  id: string;
  kind: "loader" | "action";
  module: () => Promise<Record<string, unknown>>;
  rule: (actor: ActorState, fixture: FixtureState) => Verdict;
  build: (actor: ActorState, fixture: FixtureState) => { request: Request; params: Record<string, string> };
  /**
   * Two board-lifecycle routes (DASH-006–012) don't deny through a thrown
   * Response like every other guard in the app:
   *   - duplicate/delete/archive/unarchive throw a plain `Error` (not a
   *     Response) when the caller isn't the board's owner.
   *   - moveBoard/bulkMove/bulkDelete silently affect zero rows instead of
   *     throwing anything at all.
   * These flags teach `classify()` to recognize those non-standard denial
   * shapes. Every other action denies via a real Response.
   */
  denyOnPlainError?: boolean;
  denyWhenResult?: (result: unknown) => boolean;
}

const boardUrl = (fixture: FixtureState, path = "") => `http://localhost:3000/app/board/${fixture.boardId}${path}`;
const crewId = (fixture: FixtureState) => fixture.teamId ?? "team-none";
const crewUrl = (fixture: FixtureState) => `http://localhost:3000/app/crews/${crewId(fixture)}`;

function boardLoaderSpec(
  id: string, module: () => Promise<Record<string, unknown>>, path = ""
): ActionSpec {
  return {
    id, kind: "loader", module, rule: RULES.boardAccessOnly,
    build: (actor, fixture) => ({
      request: getRequest(boardUrl(fixture, path), actor),
      params: { id: fixture.boardId },
    }),
  };
}

function boardActionSpec(
  id: string, module: () => Promise<Record<string, unknown>>, path: string, method: string,
  fields: Record<string, string>, rule: (actor: ActorState, fixture: FixtureState) => Verdict
): ActionSpec {
  return {
    id, kind: "action", module, rule,
    build: (actor, fixture) => ({
      request: formRequest(boardUrl(fixture, path), method, actor, fields),
      params: { id: fixture.boardId },
    }),
  };
}

function crewActionSpec(
  id: string, intent: string, fields: Record<string, string>,
  rule: (actor: ActorState, fixture: FixtureState) => Verdict
): ActionSpec {
  return {
    id, kind: "action", module: () => import("~/routes/app/crews.$id"), rule,
    build: (actor, fixture) => ({
      request: formRequest(crewUrl(fixture), "POST", actor, { intent, ...fields }),
      params: { id: crewId(fixture) },
    }),
  };
}

// `boardId`/`boardIds` are filled in from the fixture at build time (via
// `fields()`) since handleBoardMutation's requireBoardId needs the real id.
function dashActionSpec(
  id: string, intent: string, fields: (fixture: FixtureState) => Record<string, string>,
  rule: (actor: ActorState, fixture: FixtureState) => Verdict,
  extras: Pick<ActionSpec, "denyOnPlainError" | "denyWhenResult"> = {}
): ActionSpec {
  return {
    id, kind: "action", module: () => import("~/routes/app/dashboard"), rule, ...extras,
    build: (actor, fixture) => ({
      request: formRequest("http://localhost:3000/app/dashboard", "POST", actor, { intent, ...fields(fixture) }),
      params: {},
    }),
  };
}

const SETTINGS_FIELDS = {
  votingEnabled: "true", votingAllowed: "3", votingScope: "board",
  notesLocked: "false", boardLocked: "false", attributionEnabled: "true",
};

// BRD rows
const BRD_SPECS: ActionSpec[] = [
  boardLoaderSpec("BRD-001", () => import("~/routes/app/board")),
  boardLoaderSpec("BRD-002", () => import("~/routes/app/board.poll"), "/poll"),
  boardActionSpec("BRD-003", () => import("~/routes/app/board.title"), "/title", "PATCH",
    { title: "New Title" }, RULES.boardAccessThenFacilitator),
  boardActionSpec("BRD-004", () => import("~/routes/app/board.notes"), "/notes", "PATCH",
    { noteId: "note-1", columnId: "col-1", text: "hello", likes: "0", created: "1" }, RULES.boardAccessOnly),
  boardActionSpec("BRD-005", () => import("~/routes/app/board.notes"), "/notes", "PATCH",
    { noteId: "note-1", columnId: "col-1", text: "edited", likes: "0", created: "1" }, RULES.boardAccessOnly),
  boardActionSpec("BRD-006", () => import("~/routes/app/board.notes"), "/notes", "DELETE",
    { noteId: "note-1", columnId: "col-1" }, RULES.boardAccessOnly),
  boardActionSpec("BRD-007", () => import("~/routes/app/board.notes"), "/notes", "PATCH",
    { intent: "move", noteId: "note-1", fromColumnId: "col-1", toColumnId: "col-2" }, RULES.boardAccessOnly),
  boardActionSpec("BRD-008", () => import("~/routes/app/board.notes"), "/notes", "PATCH",
    { intent: "reorder", toColumnId: "col-1", orderedNoteIds: JSON.stringify(["note-1"]) }, RULES.boardAccessOnly),
  boardActionSpec("BRD-009", () => import("~/routes/app/board.notes"), "/notes", "PATCH",
    { intent: "like", noteId: "note-1", delta: "1" }, RULES.boardAccessOnly),
  boardActionSpec("BRD-010", () => import("~/routes/app/board.notes"), "/notes", "PATCH",
    { intent: "vote", noteId: "note-1", delta: "1" }, RULES.boardAccessThenSession),
  boardActionSpec("BRD-011", () => import("~/routes/app/board.columns"), "/columns", "PATCH",
    { columnId: "col-1", title: "New Title" }, RULES.boardAccessOnly),
  boardActionSpec("BRD-012", () => import("~/routes/app/board.columns"), "/columns", "PATCH",
    { columnId: "col-1", intent: "updatePrompt", prompt: "Think about it" }, RULES.boardAccessThenFacilitator),
  boardActionSpec("BRD-013", () => import("~/routes/app/board.columns"), "/columns", "DELETE",
    { columnId: "col-1" }, RULES.boardAccessThenFacilitator),
  boardActionSpec("BRD-014", () => import("~/routes/app/board.action-items"), "/action-items", "PATCH",
    { itemId: "item-1", intent: "complete", completed: "true" }, RULES.sessionOnly),
  boardLoaderSpec("BRD-019", () => import("~/routes/app/board.attachments"), "/attachments"),
];

// DECK rows
const DECK_SPECS: ActionSpec[] = [
  boardActionSpec("DECK-002", () => import("~/routes/app/board.timer"), "/timer", "POST",
    { seconds: "300" }, RULES.boardAccessThenFacilitator),
  boardActionSpec("DECK-003", () => import("~/routes/app/board.timer"), "/timer", "DELETE",
    {}, RULES.boardAccessThenFacilitator),
  boardActionSpec("DECK-006", () => import("~/routes/app/board.columns"), "/columns", "POST",
    { id: "col-new", title: "New Column", col_order: "2" }, RULES.boardAccessThenFacilitator),
  boardActionSpec("DECK-008", () => import("~/routes/app/board.settings"), "/settings", "PATCH",
    SETTINGS_FIELDS, RULES.facilitatorOnly),
  boardActionSpec("DECK-009", () => import("~/routes/app/board.settings"), "/settings", "PATCH",
    SETTINGS_FIELDS, RULES.facilitatorOnly),
  boardActionSpec("DECK-010", () => import("~/routes/app/board.settings"), "/settings", "PATCH",
    SETTINGS_FIELDS, RULES.facilitatorOnly),
  boardActionSpec("DECK-011", () => import("~/routes/app/board.settings"), "/settings", "POST",
    {}, RULES.facilitatorOnly),
  boardActionSpec("DECK-012", () => import("~/routes/app/board.settings"), "/settings", "PATCH",
    SETTINGS_FIELDS, RULES.facilitatorOnly),
  boardActionSpec("DECK-013", () => import("~/routes/app/board.settings"), "/settings", "PATCH",
    SETTINGS_FIELDS, RULES.facilitatorOnly),
  boardActionSpec("DECK-014", () => import("~/routes/app/board.settings"), "/settings", "PATCH",
    SETTINGS_FIELDS, RULES.facilitatorOnly),
  boardActionSpec("DECK-015", () => import("~/routes/app/board.settings"), "/settings", "PATCH",
    SETTINGS_FIELDS, RULES.facilitatorOnly),
  boardActionSpec("DECK-016", () => import("~/routes/app/board.settings"), "/settings", "PATCH",
    SETTINGS_FIELDS, RULES.facilitatorOnly),
  boardActionSpec("DECK-017", () => import("~/routes/app/board.attachments"), "/attachments", "POST",
    { type: "link", filename: "a link", link: "https://example.com" }, RULES.facilitatorOnly),
  boardActionSpec("DECK-018", () => import("~/routes/app/board.attachments"), "/attachments", "POST",
    { type: "image", filename: "a.png", imageData: "data:image/png;base64,AAAA" }, RULES.facilitatorOnly),
  boardActionSpec("DECK-019", () => import("~/routes/app/board.attachments"), "/attachments", "DELETE",
    { attachmentId: "att-1" }, RULES.facilitatorOnly),
  boardActionSpec("DECK-020", () => import("~/routes/app/board.facilitators"), "/facilitators", "POST",
    { username: "target" }, RULES.facilitatorOnly),
  boardActionSpec("DECK-021", () => import("~/routes/app/board.facilitators"), "/facilitators", "DELETE",
    { userId: "user-x" }, RULES.facilitatorOnly),
  boardActionSpec("DECK-022", () => import("~/routes/app/board.facilitators"), "/facilitators", "PATCH",
    { openFacilitation: "true" }, RULES.facilitatorOnly),
  boardActionSpec("DECK-023", () => import("~/routes/app/board.action-items"), "/action-items", "POST",
    { text: "Do the thing" }, RULES.facilitatorOnly),
  boardActionSpec("DECK-024", () => import("~/routes/app/board.action-items"), "/action-items", "PATCH",
    { itemId: "item-1", intent: "text", text: "Updated" }, RULES.facilitatorOnly),
  boardActionSpec("DECK-025", () => import("~/routes/app/board.action-items"), "/action-items", "DELETE",
    { itemId: "item-1" }, RULES.facilitatorOnly),
];

// DASH rows
const DASH_SPECS: ActionSpec[] = [
  {
    id: "DASH-001", kind: "loader", module: () => import("~/routes/app/dashboard"), rule: RULES.registeredOnly,
    build: (actor) => ({ request: getRequest("http://localhost:3000/app/dashboard", actor), params: {} }),
  },
  dashActionSpec("DASH-003", "", () => ({}), RULES.registeredOnly), // no intent -> falls through to create-board
  dashActionSpec("DASH-006", "duplicate", (f) => ({ boardId: f.boardId }), RULES.dashboardOwner, { denyOnPlainError: true }),
  dashActionSpec("DASH-007", "delete", (f) => ({ boardId: f.boardId }), RULES.dashboardOwner, { denyOnPlainError: true }),
  dashActionSpec("DASH-008", "archive", (f) => ({ boardId: f.boardId }), RULES.dashboardOwner, { denyOnPlainError: true }),
  dashActionSpec("DASH-009", "unarchive", (f) => ({ boardId: f.boardId }), RULES.dashboardOwner, { denyOnPlainError: true }),
  dashActionSpec("DASH-010", "moveBoard", (f) => ({ boardId: f.boardId, teamId: "team-move-target" }), RULES.dashboardMove,
    { denyWhenResult: (r) => (r as { moved?: number })?.moved === 0 }),
  dashActionSpec("DASH-011", "bulkMove", (f) => ({ boardIds: f.boardId, teamId: "team-move-target" }), RULES.dashboardMove,
    { denyWhenResult: (r) => (r as { moved?: number })?.moved === 0 }),
  dashActionSpec("DASH-012", "bulkDelete", (f) => ({ boardIds: f.boardId }), RULES.dashboardOwner,
    { denyWhenResult: (r) => (r as { deleted?: number })?.deleted === 0 }),
  {
    id: "DASH-016", kind: "action", module: () => import("~/routes/app/board.claim"), rule: RULES.registeredOnly,
    build: (actor, fixture) => ({
      request: formRequest("http://localhost:3000/app/board/claim", "POST", actor, {
        boardLink: `https://retrograde.test/board/${fixture.boardId}`,
      }),
      params: {},
    }),
  },
];

// CREW rows
const CREW_SPECS: ActionSpec[] = [
  {
    id: "CREW-001", kind: "loader", module: () => import("~/routes/app/crews"), rule: RULES.registeredOnly,
    build: (actor) => ({ request: getRequest("http://localhost:3000/app/crews", actor), params: {} }),
  },
  {
    id: "CREW-002", kind: "action", module: () => import("~/routes/app/crews"), rule: RULES.registeredOnly,
    build: (actor) => ({
      request: formRequest("http://localhost:3000/app/crews", "POST", actor, { intent: "create", name: "New Crew" }),
      params: {},
    }),
  },
  {
    id: "CREW-003", kind: "loader", module: () => import("~/routes/app/crews.$id"), rule: RULES.crewView,
    build: (actor, fixture) => ({ request: getRequest(crewUrl(fixture), actor), params: { id: crewId(fixture) } }),
  },
  crewActionSpec("CREW-004", "rename", { name: "Renamed" }, RULES.crewOwner(true)),
  crewActionSpec("CREW-005", "deleteTeam", {}, RULES.crewOwner(true)),
  crewActionSpec("CREW-006", "addMember", { username: "target" }, RULES.crewOwner(true)),
  crewActionSpec("CREW-007", "removeMember", { userId: "member-1" }, RULES.crewOwner(false)),
  crewActionSpec("CREW-008", "setRestrictAccess", { restrict: "true" }, RULES.crewOwner(true)),
  crewActionSpec("CREW-009", "mintKey", { display_name: "Agent A" }, RULES.crewOwner(false)),
  crewActionSpec("CREW-019", "mintKey", { display_name: "Agent B" }, RULES.crewOwner(false)),
  crewActionSpec("CREW-011", "revokeKey", { api_key_id: "key-1" }, RULES.crewOwner(false)),
  crewActionSpec("CREW-012", "createBoard", { title: "New Board" }, RULES.crewMembership),
  crewActionSpec("CREW-014", "addItem", { text: "Do the thing" }, RULES.crewMembership),
  crewActionSpec("CREW-015", "toggleItem", { itemId: "item-1", completed: "true" }, RULES.crewMembership),
  crewActionSpec("CREW-016", "updateItem", { itemId: "item-1", text: "Updated" }, RULES.crewMembership),
  crewActionSpec("CREW-017", "deleteItem", { itemId: "item-1" }, RULES.crewMembership),
];

// ADMIN rows
const ADMIN_SPECS: ActionSpec[] = [
  {
    id: "ADMIN-001", kind: "loader", module: () => import("~/routes/app/admin.dashboard"), rule: RULES.adminDashboard,
    build: (actor) => ({ request: getRequest("http://localhost:3000/app/admin/dashboard", actor), params: {} }),
  },
  {
    id: "ADMIN-004", kind: "action", module: () => import("~/routes/app/admin.admins"), rule: RULES.siteAdmin,
    build: (actor) => ({
      request: formRequest("http://localhost:3000/app/admin/admins", "POST", actor, { intent: "add", username: "target" }),
      params: {},
    }),
  },
  {
    id: "ADMIN-005", kind: "action", module: () => import("~/routes/app/admin.admins"), rule: RULES.siteAdmin,
    build: (actor) => ({
      request: formRequest("http://localhost:3000/app/admin/admins", "POST", actor, { intent: "remove", userId: "target-user-1" }),
      params: {},
    }),
  },
];

// API rows
const API_SPECS: ActionSpec[] = [
  {
    id: "API-003", kind: "loader", module: () => import("~/routes/api/board"), rule: RULES.apiBoardAccess,
    build: (actor, fixture) => ({
      request: getRequest(`http://localhost:3000/api/v1/boards/${fixture.boardId}`, actor),
      params: { id: fixture.boardId },
    }),
  },
  {
    id: "API-004", kind: "action", module: () => import("~/routes/api/board.notes"), rule: RULES.apiBulkNotes,
    build: (actor, fixture) => ({
      request: jsonRequest(`http://localhost:3000/api/v1/boards/${fixture.boardId}/notes`, "POST", actor, {
        notes: [{ columnId: "col-1", text: "hello" }],
      }),
      params: { id: fixture.boardId },
    }),
  },
  {
    id: "API-005", kind: "action", module: () => import("~/routes/api/board.action-items"), rule: RULES.apiFacilitate,
    build: (actor, fixture) => ({
      request: jsonRequest(`http://localhost:3000/api/v1/boards/${fixture.boardId}/action-items`, "POST", actor, {
        items: [{ text: "Do the thing" }],
      }),
      params: { id: fixture.boardId },
    }),
  },
];

export const ACTION_CATALOG: ActionSpec[] = [
  ...BRD_SPECS, ...DECK_SPECS, ...DASH_SPECS, ...CREW_SPECS, ...ADMIN_SPECS, ...API_SPECS,
];

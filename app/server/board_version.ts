// app/server/board_version.ts
// Board version tracking (ADR-0029). Every board has a monotonically
// increasing version in `board_versions`, bumped by deferred constraint
// triggers on every table whose rows appear in a board snapshot. This module
// owns the list of tracked tables, the snapshot inputs deliberately left
// untracked, and the DDL db_init.ts runs. All SQL here is static DDL.

interface TrackedTable {
  /** The table whose changes bump a board's version. */
  table: string;
  /** SQL scalar expression resolving the board id of the row `rec` (OLD or NEW). */
  boardId: (rec: "OLD" | "NEW") => string;
  /** Events the trigger fires on. */
  events: "INSERT OR UPDATE OR DELETE" | "INSERT OR UPDATE";
}

const viaColumn = (rec: string) =>
  `(SELECT c.board_id FROM columns c WHERE c.id = ${rec}.column_id)`;
const viaNote = (rec: string) =>
  `(SELECT c.board_id FROM notes n JOIN columns c ON c.id = n.column_id WHERE n.id = ${rec}.note_id)`;

/** table -> how its board id is resolved. */
export const TRACKED_TABLES: readonly TrackedTable[] = [
  // A delete cascades the board_versions row away, so no DELETE trigger.
  { table: "boards", boardId: (r) => `${r}.id`, events: "INSERT OR UPDATE" },
  { table: "columns", boardId: (r) => `${r}.board_id`, events: "INSERT OR UPDATE OR DELETE" },
  { table: "notes", boardId: viaColumn, events: "INSERT OR UPDATE OR DELETE" },
  { table: "note_votes", boardId: viaNote, events: "INSERT OR UPDATE OR DELETE" },
  { table: "note_likes", boardId: viaNote, events: "INSERT OR UPDATE OR DELETE" },
  // board_id is NULL for crew-level items: no board, no bump.
  { table: "action_items", boardId: (r) => `${r}.board_id`, events: "INSERT OR UPDATE OR DELETE" },
  { table: "attachments", boardId: (r) => `${r}.board_id`, events: "INSERT OR UPDATE OR DELETE" },
  { table: "board_members", boardId: (r) => `${r}.board_id`, events: "INSERT OR UPDATE OR DELETE" },
];

/** Snapshot inputs deliberately not tracked, each with the reason. */
export const UNTRACKED_TABLES: Readonly<Record<string, string>> = {
  teams: "crew name changes rarely and never during a retro; the client's periodic full refresh bounds staleness",
  team_members: "crew-owner facilitation changes rarely and never during a retro; bounded by the periodic full refresh",
  users: "author display names change rarely and never during a retro; bounded by the periodic full refresh",
};

/** The version table itself is read by the snapshot but is the counter, not an input. */
export const VERSION_TABLE = "board_versions";

export const TRACKED_TABLE_NAMES: readonly string[] = TRACKED_TABLES.map((t) => t.table);

export function triggerName(table: string): string {
  return `board_version_${table}`;
}

function triggerFunctionName(table: string): string {
  return `board_version_trg_${table}`;
}

function triggerFunctionDdl(t: TrackedTable): string {
  return `CREATE OR REPLACE FUNCTION ${triggerFunctionName(t.table)}() RETURNS trigger AS $$
DECLARE
  old_board TEXT;
  new_board TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_board := ${t.boardId("OLD")}; END IF;
  IF TG_OP <> 'DELETE' THEN new_board := ${t.boardId("NEW")}; END IF;
  IF old_board IS NOT NULL THEN PERFORM bump_board_version(old_board); END IF;
  IF new_board IS NOT NULL AND new_board IS DISTINCT FROM old_board THEN
    PERFORM bump_board_version(new_board);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;`;
}

function triggerDdl(t: TrackedTable): string {
  const name = triggerName(t.table);
  return `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = '${name}' AND tgrelid = '${t.table}'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER ${name}
      AFTER ${t.events} ON ${t.table}
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION ${triggerFunctionName(t.table)}();
  END IF;
EXCEPTION
  -- Two instances starting at once both pass the check; the loser's CREATE
  -- waits on the winner's lock and then finds the trigger there.
  WHEN duplicate_object THEN NULL;
END
$$;`;
}

const CREATE_VERSION_TABLE = `CREATE TABLE IF NOT EXISTS board_versions (
  board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  version  BIGINT NOT NULL DEFAULT 0
);`;

// The SELECT ... FROM boards makes this a no-op for a board deleted earlier in
// the same transaction (cascades run before deferred triggers) and for NULL.
const BUMP_FUNCTION = `CREATE OR REPLACE FUNCTION bump_board_version(p_board_id TEXT) RETURNS void AS $$
  INSERT INTO board_versions (board_id, version)
  SELECT id, 1 FROM boards WHERE id = p_board_id
  ON CONFLICT (board_id) DO UPDATE SET version = board_versions.version + 1;
$$ LANGUAGE sql;`;

/** Statements db_init.ts runs, in order, each as its own query. */
export const BOARD_VERSION_DDL: readonly string[] = [
  CREATE_VERSION_TABLE,
  BUMP_FUNCTION,
  ...TRACKED_TABLES.map(triggerFunctionDdl),
  ...TRACKED_TABLES.map(triggerDdl),
];

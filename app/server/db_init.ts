import { pool } from "./db_config.js";

/**
 * Database initialization function, only run initial startup of the application. If th
 * queries fail, noting happens so it's only to run on every startup.
 *
 * ONLY RUN ONCE PER DEPLOYMENT!
 */
export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    // Begin transaction
    await client.query("BEGIN");

    console.log("Creating tables...");

    // Create tables if they don’t exist
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL
      );
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS columns (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        col_order INT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        column_id TEXT NOT NULL REFERENCES columns (id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        is_new BOOLEAN NOT NULL DEFAULT FALSE,
        created TEXT NOT NULL,
        note_order INTEGER NOT NULL DEFAULT 0
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Stable external identifier from IdP
        external_id VARCHAR(255) NOT NULL,

        name VARCHAR(255),
        preferred_username VARCHAR(255),
        given_name VARCHAR(255),
        family_name VARCHAR(255),

        email VARCHAR(255),
        email_verified BOOLEAN,

        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

        UNIQUE (external_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS board_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id text NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'owner',
        created_at timestamp without time zone NOT NULL DEFAULT now(),
        UNIQUE(board_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_board_members_user_id ON board_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_board_members_board_id ON board_members(board_id);
    `);

    console.log("Done");
    console.log("Starting migrations...");

    // Migration queries for updating existing tables if needed
    // 1 Add the text column if it doesn't exist
    await client.query(`
      ALTER TABLE notes
      ADD COLUMN IF NOT EXISTS created TEXT;
    `);

    // 2 Populate existing rows with the default value "1"
    await client.query(`
      UPDATE notes
      SET created = '1'
      WHERE created IS NULL;
    `);

    // 3 Set the column to NOT NULL and default to "1" for future inserts
    await client.query(`
      ALTER TABLE notes
      ALTER COLUMN created SET DEFAULT '1',
      ALTER COLUMN created SET NOT NULL;
    `);

    // 4 Move timers to the backend so it can sync across clients 
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS timer_ends_at TIMESTAMP WITH TIME ZONE NULL,
      ADD COLUMN IF NOT EXISTS timer_duration_seconds INTEGER NULL,
      ADD COLUMN IF NOT EXISTS timer_running BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    `);

    // 5 Add created_by to boards for ownership and permissions
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
   `);

    // 6 Add note_order for drag-and-drop reordering within columns
    await client.query(`
      ALTER TABLE notes
      ADD COLUMN IF NOT EXISTS note_order INTEGER;
    `);

    await client.query(`
      UPDATE notes
      SET note_order = 0
      WHERE note_order IS NULL;
    `);

    await client.query(`
      ALTER TABLE notes
      ALTER COLUMN note_order SET DEFAULT 0,
      ALTER COLUMN note_order SET NOT NULL;
    `);

    // 7 Add prompt text to columns
    await client.query(`
      ALTER TABLE columns
      ADD COLUMN IF NOT EXISTS prompt TEXT NOT NULL DEFAULT '';
    `);

    // 8 Add voting settings to boards
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS voting_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS voting_allowed INTEGER NOT NULL DEFAULT 5;
    `);

    // 9 Create note_votes table to track who voted on which note
    await client.query(`
      CREATE TABLE IF NOT EXISTS note_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        count INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(note_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_note_votes_note_id ON note_votes(note_id);
      CREATE INDEX IF NOT EXISTS idx_note_votes_user_id ON note_votes(user_id);
    `);

    // 15 Add count column to note_votes for multi-vote support
    await client.query(`
      ALTER TABLE note_votes
      ADD COLUMN IF NOT EXISTS count INTEGER NOT NULL DEFAULT 1;
    `);

    // 10 Create attachments table for board file links and uploaded images
    await client.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        link TEXT,
        type TEXT NOT NULL DEFAULT 'link',
        image_data TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_board_id ON attachments(board_id);
    `);

    // 11 Add lock columns to boards for note lock and full board lock
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS notes_locked BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS board_locked BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // 12 Track note creator for contributor counts
    await client.query(`
      ALTER TABLE notes
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    `);

    // 13 Track note likes per user for participant counts
    await client.query(`
      CREATE TABLE IF NOT EXISTS note_likes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_note_likes_note_id ON note_likes(note_id);
      CREATE INDEX IF NOT EXISTS idx_note_likes_user_id ON note_likes(user_id);
    `);

    // 14 Support anonymous users: flag + board they were created on
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS board_id TEXT REFERENCES boards(id) ON DELETE SET NULL;
    `);

    // 15 Add archived_at to boards for soft-archive
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE NULL;
    `);

    // 16 Admin users — dynamically granted admin dashboard access
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        granted_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);
    `);

    // 17 Add voting_scope to boards for board/column/note vote limits
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS voting_scope TEXT NOT NULL DEFAULT 'board';
    `);

    // 18 Agent identity: distinguish AI-agent anonymous users from human ones
    //    and let them self-identify with a display name.
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_agent BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS display_name TEXT;
    `);

    // 19 Attribution toggle: off by default to preserve retro anonymity.
    //    When false, the API hides note authorship from the response entirely.
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS attribution_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // 20 Teams: the authorization + (future) billing unit. See ADR-0003.
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        is_personal BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 21 Team membership.
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(team_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
    `);

    // 22 API keys: team-scoped, hashed at rest. See ADR-0004.
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        display_name TEXT NOT NULL,
        agent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP,
        revoked_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_team_id ON api_keys(team_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
    `);

    // 23 Boards belong to teams. Nullable: teamless = trial pool. See ADR-0005.
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_boards_team_id ON boards(team_id);
    `);

    // 26 Open facilitation: when true, anyone on the board may use the
    //    Command Deck. See ADR-0006 and issue #97.
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS open_facilitation BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // 27 Action items: board-level (board_id set) or team-level (team_id set).
    //    See issues #88 and #72.
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMP NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        item_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_action_items_board_id ON action_items(board_id);
      CREATE INDEX IF NOT EXISTS idx_action_items_team_id ON action_items(team_id);
    `);

    // 28 Action items column visibility: facilitators can hide the board's
    //    Action Items column from the Command Deck. Visible by default.
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS action_items_visible BOOLEAN NOT NULL DEFAULT TRUE;
    `);

    // 30 Blind brainstorm: when true, each participant sees only the notes they
    //    authored (filtered server-side in getBoardServer). Off by default.
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS hide_others_notes BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // 31 Crew board access: when true, only crew members can open the crew's
    //    boards. Defaults on for every crew; personal crews are forced off so
    //    their boards keep the anyone-with-the-link trial behavior. Re-running
    //    the personal reset is safe — personal crews never expose the toggle.
    await client.query(`
      ALTER TABLE teams
      ADD COLUMN IF NOT EXISTS restrict_board_access BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await client.query(`
      UPDATE teams SET restrict_board_access = FALSE WHERE is_personal = TRUE;
    `);

    // 29 Personal crews are titled "Personal" — the title is the tag. Renames
    //    the legacy "<handle>'s Team" rows; idempotent by the WHERE guard.
    await client.query(`
      UPDATE teams SET name = 'Personal'
      WHERE is_personal = TRUE AND name <> 'Personal';
    `);

    // 24 Personal teams are created per-user at login (ensurePersonalTeam,
    //    see auth/callback.ts) — every registered user gets one the next
    //    time they sign in, so no startup backfill is needed for that part.
    //
    // 25 Boards, however, must NOT be auto-attached to a team on our behalf.
    //    Teams/crews are still pre-launch (ADR-0007/0008), so any team_id a
    //    board picked up from the old startup backfill doesn't reflect a
    //    real choice — it was silently re-applied on every server restart,
    //    which also fought the crew-deletion flow (a deliberately-unassigned
    //    board would get re-claimed the next time the server booted). Reset
    //    every board to Unassigned exactly once so owners land on the
    //    dashboard's "N boards haven't joined a crew yet" guide
    //    (SortBoardsBanner) and choose deliberately. Gated by a flag column
    //    so this never re-runs against a board once it's been through it —
    //    including future boards, which always get an explicit team_id at
    //    creation time and so are exempt via the flipped column default.
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS team_assignment_finalized BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      UPDATE boards
      SET team_id = NULL, team_assignment_finalized = TRUE
      WHERE NOT team_assignment_finalized;
    `);

    await client.query(`
      ALTER TABLE boards
      ALTER COLUMN team_assignment_finalized SET DEFAULT TRUE;
    `);

    // 32 GAP-002 / ADR-0011: anonymous boards must have no owner and be
    //    invariantly open_facilitation = TRUE — that's the whole reason a
    //    crewless board's Command Deck still works once its owner row is
    //    gone. Existing crewless boards were stamped with an owner (the
    //    anonymous visitor, or the agent itself on the API trial path) and
    //    open_facilitation = FALSE, which is exactly backwards. One-time
    //    reset, gated so it can never re-run — same 3-step pattern as
    //    ADR-0009's block 25: add a column defaulting FALSE so every
    //    existing row is in scope once, do the work while flagging each row
    //    TRUE, then flip the column default to TRUE so a board created from
    //    this point forward (crewless boards now insert with
    //    open_facilitation TRUE and no owner row from the start — see
    //    createBoard/createBoardWithColumns) is automatically exempt.
    //    Registered users' owner rows on crewless boards (grandfathered by
    //    the ADR-0009 reset) are untouched — only rows whose user is
    //    anonymous or an agent are removed.
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS anonymous_ownership_cleared BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      DELETE FROM board_members bm
      USING boards b, users u
      WHERE bm.board_id = b.id
        AND bm.user_id = u.id
        AND bm.role = 'owner'
        AND b.team_id IS NULL
        AND NOT b.anonymous_ownership_cleared
        AND (u.is_anonymous OR u.is_agent);
    `);

    await client.query(`
      UPDATE boards
      SET anonymous_ownership_cleared = TRUE,
          open_facilitation = CASE WHEN team_id IS NULL THEN TRUE ELSE open_facilitation END
      WHERE NOT anonymous_ownership_cleared;
    `);

    await client.query(`
      ALTER TABLE boards
      ALTER COLUMN anonymous_ownership_cleared SET DEFAULT TRUE;
    `);

    // 33 GAP-005 / ADR-0011: subscription state belongs to the account, not
    //    the crew. Stripe's own status strings (active, past_due, canceled,
    //    ...) are stored verbatim in subscription_status — no custom enum,
    //    so there's no translation layer to keep in sync with Stripe's
    //    state machine. See ADR-0013.
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
        ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
        ADD COLUMN IF NOT EXISTS subscription_status TEXT;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
    `);

    console.log("Done");
    console.log("Inserting dev data...");

    await client.query(`
      INSERT INTO boards (id, title)
      VALUES ('dev-test', 'Dev Test')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO columns (id, board_id, title, col_order)
      VALUES ('dev-test-col-1', 'dev-test', 'To Do', 1)
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO notes (id, column_id, text, likes, is_new, created)
      VALUES
        ('dev-test-note-1', 'dev-test-col-1', 'This is a note', 0, FALSE, '1760074762199'),
        ('dev-test-note-2', 'dev-test-col-1', 'This is another note', 2, FALSE, '1760074762205')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Commit transaction
    await client.query("COMMIT");

    console.log("Done");
    console.log("Database initialized successfully!");

  } catch (error) {
    // Rollbak in case of error
    await client.query("ROLLBACK");
    console.error("Error during database initialization:", error);
    process.exit(1);
  } finally {
    // Release client back to pool
    client.release();
  }
}

initializeDatabase();
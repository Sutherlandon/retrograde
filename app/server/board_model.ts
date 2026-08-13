// ---------------------------------------------------------------------------
// board_model.ts — pure DB access. Returns DTOs. No client concerns.
// ---------------------------------------------------------------------------

import { pool } from "./db_config";
import "./db_init";
import type { BoardDTO, DashboardBoardRow } from "./board.types";

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

export async function getBoardServer(id: string, userId?: string | null): Promise<BoardDTO | null> {
  const res = await pool.query(
    `
    SELECT json_build_object(
      'id',             b.id,
      'title',          b.title,
      'team_id',        b.team_id,
      'team_name',      MAX(t.name),
      'readonly',       false,
      'isOwner',        CASE
                          WHEN $2::uuid IS NOT NULL
                          THEN EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = $2::uuid AND bm.role = 'owner')
                          ELSE FALSE
                        END,
      'timerRunning',   b.timer_running,
      'timerStartedAt', to_char(b.timer_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'timerEndsAt',    to_char(b.timer_ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'votingEnabled',    b.voting_enabled,
      'votingAllowed',    b.voting_allowed,
      'votingScope',      b.voting_scope,
      'notesLocked',      b.notes_locked,
      'boardLocked',      b.board_locked,
      'attributionEnabled', b.attribution_enabled,
      'actionItemsVisible', b.action_items_visible,
      'hideOthersNotes',  b.hide_others_notes,
      'openFacilitation', b.open_facilitation,
      'canFacilitate',    CASE
                            WHEN $2::uuid IS NOT NULL
                            THEN b.open_facilitation OR EXISTS(
                              SELECT 1 FROM board_members bm2
                              WHERE bm2.board_id = b.id
                                AND bm2.user_id = $2::uuid
                                AND bm2.role IN ('owner', 'facilitator')
                            )
                            ELSE b.open_facilitation
                          END,
      'actionItems', COALESCE(
        (SELECT json_agg(
           json_build_object(
             'id',           ai.id,
             'text',         ai.text,
             'completed',    ai.completed,
             'item_order',   ai.item_order,
             'created_at',   ai.created_at,
             'completed_at', ai.completed_at
           )
           ORDER BY ai.item_order, ai.created_at
         )
         FROM action_items ai
         WHERE ai.board_id = b.id),
        '[]'::json
      ),
      'voterCount',       (SELECT COUNT(DISTINCT user_id) FROM (
                            SELECT nv.user_id FROM note_votes nv JOIN notes n ON nv.note_id = n.id JOIN columns c ON n.column_id = c.id WHERE c.board_id = b.id
                            UNION
                            SELECT nl.user_id FROM note_likes nl JOIN notes n ON nl.note_id = n.id JOIN columns c ON n.column_id = c.id WHERE c.board_id = b.id
                          ) participants),
      'contributorCount', (SELECT COUNT(DISTINCT n.created_by) FROM notes n JOIN columns c ON n.column_id = c.id WHERE c.board_id = b.id AND n.created_by IS NOT NULL),
      'columns', COALESCE(
        json_agg(
          json_build_object(
            'id',        c.id,
            'title',     c.title,
            'prompt',    c.prompt,
            'col_order', c.col_order,
            'notes', COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id',         n.id,
                    'text',       n.text,
                    'likes',      n.likes,
                    'votes',      (SELECT COALESCE(SUM(nv.count), 0) FROM note_votes nv WHERE nv.note_id = n.id),
                    'user_votes', CASE
                                    WHEN $2::uuid IS NOT NULL
                                    THEN COALESCE((SELECT nv.count FROM note_votes nv WHERE nv.note_id = n.id AND nv.user_id = $2::uuid), 0)
                                    ELSE 0
                                  END,
                    'is_new',     n.is_new,
                    'created',    n.created,
                    'note_order', n.note_order,
                    -- Agent authorship is ALWAYS surfaced (transparency about AI involvement
                    -- trumps anonymity). Human authorship is gated by attribution_enabled.
                    'author',     CASE
                                    WHEN u.id IS NOT NULL AND (b.attribution_enabled OR u.is_agent)
                                    THEN json_build_object(
                                      'display_name', COALESCE(u.display_name, u.preferred_username, 'Guest'),
                                      'is_agent',     COALESCE(u.is_agent, false)
                                    )
                                    ELSE NULL
                                  END
                  )
                  ORDER BY n.note_order, n.created
                )
                FROM notes n
                LEFT JOIN users u ON u.id = n.created_by
                WHERE n.column_id = c.id
                  -- Blind brainstorm: each viewer sees only their own notes.
                  -- created_by is never exposed in the DTO, so this filter is
                  -- the only way others' notes stay hidden.
                  AND (NOT b.hide_others_notes OR n.created_by = $2::uuid)
              ),
              '[]'::json
            )
          )
          ORDER BY c.col_order
        ) FILTER (WHERE c.id IS NOT NULL),
        '[]'::json
      )
    ) AS board
    FROM boards b
    LEFT JOIN columns c ON c.board_id = b.id
    LEFT JOIN teams t ON t.id = b.team_id
    WHERE b.id = $1
    GROUP BY b.id
    `,
    [id, userId ?? null]
  );

  if (res.rowCount === 0) return null;
  return res.rows[0].board as BoardDTO;
}

/**
 * List the boards a user can see, as dashboard/crew table rows. A board is
 * visible when the user is a board member (owner/facilitator) OR the board
 * belongs to one of the user's crews. Scope to a single crew with `teamId`
 * (used by the crew page). `order` is a caller-controlled ORDER BY expression
 * (never user input).
 */
export async function listVisibleBoards(
  userId: string,
  opts: { teamId?: string; archived?: boolean; order?: string } = {}
): Promise<DashboardBoardRow[]> {
  const { teamId, archived = false, order = "updated_at DESC" } = opts;
  const res = await pool.query(
    `
    SELECT * FROM (
      SELECT DISTINCT ON (b.id)
        b.*,
        COALESCE(bm.role, 'team') AS role,
        t.name AS team_name,
        (SELECT COUNT(*)::int FROM action_items ai
          WHERE ai.board_id = b.id AND NOT ai.completed) AS open_action_items
      FROM boards b
      LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
      LEFT JOIN teams t ON t.id = b.team_id
      WHERE b.archived_at IS ${archived ? "NOT NULL" : "NULL"}
        ${teamId
          ? "AND b.team_id = $2"
          : `AND (bm.user_id IS NOT NULL
               OR b.team_id IN (SELECT team_id FROM team_members WHERE user_id = $1))`}
      ORDER BY b.id
    ) visible
    ORDER BY ${order}
    `,
    teamId ? [userId, teamId] : [userId]
  );
  return res.rows as DashboardBoardRow[];
}

// ---------------------------------------------------------------------------
// WRITE — each function is called by its own resource route action
// ---------------------------------------------------------------------------

export async function createBoard(
  title: string = "Untitled",
  userId: string | null = null,
  teamId: string | null = null
): Promise<string> {
  const client = await pool.connect();
  const id = crypto.randomUUID();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO boards (id, title, created_by, team_id) VALUES ($1, $2, $3, $4)`,
      [id, title, userId, teamId]
    );

    if (userId) {
      await client.query(
        `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [id, userId]
      );
    }

    // Follow-ups live in the right-side Mission Objectives column (board-level
    // action_items), so the default board no longer ships an "Action items" column.
    const defaultColumns = ["What went well?", "What can we do better?"];
    await Promise.all(
      defaultColumns.map((colTitle, i) =>
        client.query(
          `INSERT INTO columns (id, board_id, title, col_order) VALUES ($1, $2, $3, $4)`,
          [crypto.randomUUID(), id, colTitle, i]
        )
      )
    );

    await client.query("COMMIT");
    return id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function createBoardWithColumns(
  title: string,
  columns: { title: string; prompt?: string }[],
  userId: string | null,
  teamId: string | null = null
): Promise<string> {
  const client = await pool.connect();
  const id = crypto.randomUUID();

  // Empty array falls back to default retro columns
  const cols = columns.length > 0
    ? columns
    : [
        { title: "What went well?" },
        { title: "What can we do better?" },
      ];

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO boards (id, title, created_by, team_id) VALUES ($1, $2, $3, $4)`,
      [id, title, userId, teamId]
    );

    if (userId) {
      await client.query(
        `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [id, userId]
      );
    }

    for (let i = 0; i < cols.length; i++) {
      await client.query(
        `INSERT INTO columns (id, board_id, title, col_order, prompt) VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), id, cols[i].title, i, cols[i].prompt ?? ""]
      );
    }

    await client.query("COMMIT");
    return id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Bulk insert notes across one or more columns of a single board.
 * Validates every columnId belongs to boardId; rejects the entire batch on mismatch.
 * Per-column note_order continues from the existing max.
 */
export async function bulkInsertNotesServer(
  boardId: string,
  notes: { columnId: string; text: string }[],
  userId: string
): Promise<BoardDTO | null> {
  if (notes.length === 0) return getBoardServer(boardId, userId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validate all columnIds belong to this board
    const requestedColumnIds = Array.from(new Set(notes.map((n) => n.columnId)));
    const colCheck = await client.query(
      `SELECT id FROM columns WHERE board_id = $1 AND id = ANY($2::text[])`,
      [boardId, requestedColumnIds]
    );
    const validIds = new Set(colCheck.rows.map((r) => r.id));
    const bad = requestedColumnIds.filter((id) => !validIds.has(id));
    if (bad.length > 0) {
      throw new Error(`COLUMN_NOT_ON_BOARD:${bad.join(",")}`);
    }

    // Find per-column starting note_order
    const startOrder: Record<string, number> = {};
    for (const colId of requestedColumnIds) {
      const r = await client.query(
        `SELECT COALESCE(MAX(note_order), -1) + 1 AS next FROM notes WHERE column_id = $1`,
        [colId]
      );
      startOrder[colId] = Number(r.rows[0].next);
    }

    // Insert notes one row at a time inside the transaction.
    // (A single multi-row INSERT was considered, but per-column order tracking
    // is simpler this way and the batch is capped at 200 by the route.)
    const perColumnCounter: Record<string, number> = {};
    const nowMs = Date.now().toString();
    for (const note of notes) {
      const order = startOrder[note.columnId] + (perColumnCounter[note.columnId] ?? 0);
      perColumnCounter[note.columnId] = (perColumnCounter[note.columnId] ?? 0) + 1;
      await client.query(
        `INSERT INTO notes (id, column_id, text, likes, is_new, created, note_order, created_by)
         VALUES ($1, $2, $3, 0, false, $4, $5, $6)`,
        [crypto.randomUUID(), note.columnId, note.text, nowMs, order, userId]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return getBoardServer(boardId, userId);
}

export async function setBoardOwner(boardId: string, userId: string) {
  await pool.query(
    `UPDATE boards SET created_by = $1 WHERE id = $2`,
    [userId, boardId]
  );
  await pool.query(
    `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')
     ON CONFLICT (board_id, user_id) DO NOTHING`,
    [boardId, userId]
  );
}

export async function addColumnServer(
  boardId: string,
  id: string,
  title: string,
  colOrder: number,
  viewerId?: string | null
) {
  await pool.query(
    `INSERT INTO columns (id, board_id, title, col_order) VALUES ($1, $2, $3, $4)`,
    [id, boardId, title, colOrder]
  );
  return getBoardServer(boardId, viewerId);
}

export async function updateColumnTitleServer(
  boardId: string,
  columnId: string,
  newTitle: string,
  viewerId?: string | null
) {
  await pool.query(`UPDATE columns SET title = $1 WHERE id = $2`, [newTitle, columnId]);
  return getBoardServer(boardId, viewerId);
}

export async function updateColumnPromptServer(
  boardId: string,
  columnId: string,
  prompt: string,
  viewerId?: string | null
) {
  await pool.query(`UPDATE columns SET prompt = $1 WHERE id = $2`, [prompt, columnId]);
  return getBoardServer(boardId, viewerId);
}

export async function deleteColumnServer(boardId: string, columnId: string, viewerId?: string | null) {
  await pool.query(`DELETE FROM columns WHERE id = $1`, [columnId]);
  return getBoardServer(boardId, viewerId);
}

export async function upsertNoteServer(
  boardId: string,
  noteId: string,
  columnId: string,
  newText: string,
  likes: number,
  created: string,
  userId?: string | null
) {
  await pool.query(
    `
    INSERT INTO notes (id, column_id, text, likes, is_new, created, note_order, created_by)
    VALUES ($1, $2, $3, $4, false, $5, COALESCE((SELECT MAX(note_order) + 1 FROM notes WHERE column_id = $2), 0), $6)
    ON CONFLICT (id) DO UPDATE
    SET
      text   = EXCLUDED.text,
      is_new = false,
      likes  = CASE
                 WHEN notes.likes > EXCLUDED.likes THEN notes.likes + 1
                 ELSE EXCLUDED.likes
               END
    `,
    [noteId, columnId, newText, likes, created, userId ?? null]
  );
  // The author is the viewer here, so this response is correctly scoped in
  // blind mode (they only ever see their own notes anyway).
  return getBoardServer(boardId, userId);
}

export async function likeNoteServer(boardId: string, noteId: string, delta: number, userId?: string | null) {
  await pool.query(`UPDATE notes SET likes = likes + $1 WHERE id = $2`, [delta, noteId]);
  if (userId && delta > 0) {
    await pool.query(`INSERT INTO note_likes (note_id, user_id) VALUES ($1, $2)`, [noteId, userId]);
  }
  return getBoardServer(boardId, userId);
}

export async function voteNoteServer(boardId: string, noteId: string, userId: string, delta: number) {
  if (delta > 0) {
    // Upsert: insert or increment count
    await pool.query(
      `INSERT INTO note_votes (note_id, user_id, count)
       VALUES ($1, $2, $3)
       ON CONFLICT (note_id, user_id) DO UPDATE SET count = note_votes.count + $3`,
      [noteId, userId, delta]
    );
  } else if (delta < 0) {
    // Decrement count, then delete row if count reached 0
    await pool.query(
      `UPDATE note_votes SET count = count + $3 WHERE note_id = $1 AND user_id = $2`,
      [noteId, userId, delta]
    );
    await pool.query(
      `DELETE FROM note_votes WHERE note_id = $1 AND user_id = $2 AND count <= 0`,
      [noteId, userId]
    );
  }
  return getBoardServer(boardId, userId);
}

export async function updateBoardSettingsServer(
  boardId: string,
  settings: {
    votingEnabled: boolean;
    votingAllowed: number;
    votingScope: string;
    notesLocked: boolean;
    boardLocked: boolean;
    attributionEnabled: boolean;
    actionItemsVisible?: boolean;
    hideOthersNotes?: boolean;
  },
  viewerId?: string | null
) {
  await pool.query(
    `UPDATE boards SET voting_enabled = $1, voting_allowed = $2, voting_scope = $3, notes_locked = $4, board_locked = $5, attribution_enabled = $6, action_items_visible = $7, hide_others_notes = $8 WHERE id = $9`,
    [
      settings.votingEnabled,
      settings.votingAllowed,
      settings.votingScope,
      settings.notesLocked,
      settings.boardLocked,
      settings.attributionEnabled,
      settings.actionItemsVisible ?? true,
      settings.hideOthersNotes ?? false,
      boardId,
    ]
  );
  return getBoardServer(boardId, viewerId);
}

export async function clearBoardVotesServer(boardId: string) {
  const noteIds = `SELECT n.id FROM notes n JOIN columns c ON c.id = n.column_id WHERE c.board_id = $1`;
  await pool.query(`DELETE FROM note_votes WHERE note_id IN (${noteIds})`, [boardId]);
  await pool.query(`DELETE FROM note_likes WHERE note_id IN (${noteIds})`, [boardId]);
  await pool.query(
    `UPDATE notes SET likes = 0 WHERE column_id IN (SELECT id FROM columns WHERE board_id = $1)`,
    [boardId]
  );
}

export async function deleteNoteServer(boardId: string, columnId: string, noteId: string, viewerId?: string | null) {
  await pool.query(`DELETE FROM notes WHERE id = $1`, [noteId]);
  return getBoardServer(boardId, viewerId);
}

export async function moveNoteServer(
  boardId: string,
  fromColumnId: string,
  toColumnId: string,
  noteId: string,
  viewerId?: string | null
) {
  await pool.query(`UPDATE notes SET column_id = $1 WHERE id = $2`, [toColumnId, noteId]);
  return getBoardServer(boardId, viewerId);
}

export async function reorderNotesServer(
  boardId: string,
  toColumnId: string,
  orderedNoteIds: string[],
  viewerId?: string | null
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < orderedNoteIds.length; i++) {
      await client.query(
        `UPDATE notes SET column_id = $1, note_order = $2 WHERE id = $3`,
        [toColumnId, i, orderedNoteIds[i]]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getBoardServer(boardId, viewerId);
}

export async function startTimerServer(
  boardId: string,
  durationSeconds: number
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `SELECT timer_running FROM boards WHERE id = $1 FOR UPDATE`,
      [boardId]
    );

    if (res.rowCount === 0) throw new Error("Board not found");
    if (res.rows[0].timer_running) throw new Error("TIMER_ALREADY_RUNNING");

    const now = new Date().toISOString();
    const endsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    await client.query(
      `UPDATE boards SET timer_running = true, timer_started_at = $1, timer_ends_at = $2 WHERE id = $3`,
      [now, endsAt, boardId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if ((err as Error).message === "TIMER_ALREADY_RUNNING") {
      throw new Response("Timer already running", { status: 409 });
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function stopTimerServer(boardId: string): Promise<void> {
  await pool.query(
    `UPDATE boards SET timer_running = false, timer_started_at = NULL, timer_ends_at = NULL WHERE id = $1`,
    [boardId]
  );
}

export async function duplicateBoardServer(
  boardId: string,
  userId: string
): Promise<string> {
  const client = await pool.connect();
  const newId = crypto.randomUUID();

  try {
    await client.query("BEGIN");

    // Get the original board title and settings
    const boardRes = await client.query(
      `SELECT title, voting_enabled, voting_allowed, voting_scope FROM boards WHERE id = $1`,
      [boardId]
    );
    if (boardRes.rowCount === 0) throw new Error("Board not found");
    const { title, voting_enabled, voting_allowed, voting_scope } = boardRes.rows[0];
    const newTitle = `${title} (copy)`;

    // Create the new board (copy voting settings, locks default to false)
    await client.query(
      `INSERT INTO boards (id, title, created_by, voting_enabled, voting_allowed, voting_scope) VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId, newTitle, userId, voting_enabled, voting_allowed, voting_scope]
    );

    // Add the user as owner
    await client.query(
      `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [newId, userId]
    );

    // Copy columns (without notes)
    const cols = await client.query(
      `SELECT title, col_order, prompt FROM columns WHERE board_id = $1 ORDER BY col_order`,
      [boardId]
    );
    for (const col of cols.rows) {
      await client.query(
        `INSERT INTO columns (id, board_id, title, col_order, prompt) VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), newId, col.title, col.col_order, col.prompt]
      );
    }

    await client.query("COMMIT");
    return newId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Move one or more boards to a team (or to no team with teamId = null).
 * Permission is enforced in SQL: the caller must own each board, and when
 * moving TO a team, must be a member of that team. Boards that fail either
 * guard are silently skipped; the returned ids are the boards actually moved.
 */
export async function moveBoardsToTeamServer(
  boardIds: string[],
  teamId: string | null,
  userId: string
): Promise<string[]> {
  if (boardIds.length === 0) return [];

  const res = await pool.query<{ id: string }>(
    `UPDATE boards b SET team_id = $2
     WHERE b.id = ANY($1)
       AND EXISTS (
         SELECT 1 FROM board_members bm
         WHERE bm.board_id = b.id AND bm.user_id = $3 AND bm.role = 'owner'
       )
       AND ($2::uuid IS NULL OR EXISTS (
         SELECT 1 FROM team_members tm
         WHERE tm.team_id = $2 AND tm.user_id = $3
       ))
     RETURNING b.id`,
    [boardIds, teamId, userId]
  );
  return res.rows.map((r) => r.id);
}

/**
 * Count the active, teamless boards the user owns — powers the sidebar's
 * Unassigned crew entry and the "sort your boards" conversion flow.
 */
export async function countUnassignedBoardsForUser(userId: string): Promise<number> {
  const res = await pool.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count
     FROM boards b
     JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1 AND bm.role = 'owner'
     WHERE b.team_id IS NULL AND b.archived_at IS NULL`,
    [userId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/**
 * Delete multiple boards in a single transaction. Only boards the caller
 * owns are deleted; others in the list are silently skipped. Returns the
 * ids that were actually deleted.
 */
export async function bulkDeleteBoardsServer(
  boardIds: string[],
  userId: string
): Promise<string[]> {
  if (boardIds.length === 0) return [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owned = await client.query<{ id: string }>(
      `SELECT b.id FROM boards b
       JOIN board_members bm ON bm.board_id = b.id
       WHERE b.id = ANY($1) AND bm.user_id = $2 AND bm.role = 'owner'`,
      [boardIds, userId]
    );
    const ownedIds = owned.rows.map((r) => r.id);

    if (ownedIds.length > 0) {
      await client.query(
        `DELETE FROM notes WHERE column_id IN (SELECT id FROM columns WHERE board_id = ANY($1))`,
        [ownedIds]
      );
      await client.query(`DELETE FROM columns WHERE board_id = ANY($1)`, [ownedIds]);
      await client.query(`DELETE FROM board_members WHERE board_id = ANY($1)`, [ownedIds]);
      await client.query(`DELETE FROM boards WHERE id = ANY($1)`, [ownedIds]);
    }

    await client.query("COMMIT");
    return ownedIds;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteBoardServer(
  boardId: string,
  userId: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verify the user is the owner
    const memberRes = await client.query(
      `SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2`,
      [boardId, userId]
    );
    if (memberRes.rowCount === 0 || memberRes.rows[0].role !== "owner") {
      throw new Error("Only the board owner can delete a board");
    }

    // Delete notes for all columns in this board
    await client.query(
      `DELETE FROM notes WHERE column_id IN (SELECT id FROM columns WHERE board_id = $1)`,
      [boardId]
    );

    // Delete columns
    await client.query(`DELETE FROM columns WHERE board_id = $1`, [boardId]);

    // Delete board members
    await client.query(`DELETE FROM board_members WHERE board_id = $1`, [boardId]);

    // Delete the board
    await client.query(`DELETE FROM boards WHERE id = $1`, [boardId]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Facilitators (ADR-0006, issue #97)
// ---------------------------------------------------------------------------

export async function listFacilitatorsServer(boardId: string) {
  const res = await pool.query(
    `SELECT bm.user_id, bm.role,
            COALESCE(u.display_name, u.preferred_username, 'Guest') AS username
     FROM board_members bm
     JOIN users u ON u.id = bm.user_id
     WHERE bm.board_id = $1 AND bm.role IN ('owner', 'facilitator')
     ORDER BY (bm.role = 'owner') DESC, bm.created_at ASC`,
    [boardId]
  );
  return res.rows as { user_id: string; role: "owner" | "facilitator"; username: string }[];
}

export async function addFacilitatorServer(boardId: string, userId: string) {
  // Never demote an owner who is granted facilitator by mistake.
  await pool.query(
    `INSERT INTO board_members (board_id, user_id, role)
     VALUES ($1, $2, 'facilitator')
     ON CONFLICT (board_id, user_id) DO UPDATE
     SET role = CASE WHEN board_members.role = 'owner' THEN 'owner' ELSE 'facilitator' END`,
    [boardId, userId]
  );
}

export async function removeFacilitatorServer(boardId: string, userId: string) {
  // role guard means the owner can never be removed through this path
  await pool.query(
    `DELETE FROM board_members
     WHERE board_id = $1 AND user_id = $2 AND role = 'facilitator'`,
    [boardId, userId]
  );
}

export async function setOpenFacilitationServer(boardId: string, open: boolean) {
  await pool.query(
    `UPDATE boards SET open_facilitation = $1 WHERE id = $2`,
    [open, boardId]
  );
}

export async function getOpenFacilitationServer(boardId: string): Promise<boolean | null> {
  const res = await pool.query<{ open_facilitation: boolean }>(
    `SELECT open_facilitation FROM boards WHERE id = $1`,
    [boardId]
  );
  if (res.rowCount === 0) return null;
  return res.rows[0].open_facilitation;
}

export async function updateBoardTitleServer(boardId: string, newTitle: string) {
  await pool.query(`UPDATE boards SET title = $1 WHERE id = $2`, [newTitle, boardId]);
  return getBoardServer(boardId);
}

export async function archiveBoardServer(boardId: string, userId: string): Promise<void> {
  const memberRes = await pool.query(
    `SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId]
  );
  if (memberRes.rowCount === 0 || memberRes.rows[0].role !== "owner") {
    throw new Error("Only the board owner can archive a board");
  }
  await pool.query(`UPDATE boards SET archived_at = NOW() WHERE id = $1`, [boardId]);
}

export async function unarchiveBoardServer(boardId: string, userId: string): Promise<void> {
  const memberRes = await pool.query(
    `SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId]
  );
  if (memberRes.rowCount === 0 || memberRes.rows[0].role !== "owner") {
    throw new Error("Only the board owner can unarchive a board");
  }
  await pool.query(`UPDATE boards SET archived_at = NULL WHERE id = $1`, [boardId]);
}
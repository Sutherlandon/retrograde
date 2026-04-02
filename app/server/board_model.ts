// ---------------------------------------------------------------------------
// board_model.ts — pure DB access. Returns DTOs. No client concerns.
// ---------------------------------------------------------------------------

import { pool } from "./db_config";
import "./db_init";
import type { BoardDTO } from "./board.types";

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

export async function getBoardServer(id: string, userId?: string | null): Promise<BoardDTO | null> {
  const res = await pool.query(
    `
    SELECT json_build_object(
      'id',             b.id,
      'title',          b.title,
      'readonly',       false,
      'isOwner',        CASE
                          WHEN $2::uuid IS NOT NULL
                          THEN EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = $2::uuid AND bm.role = 'owner')
                          ELSE FALSE
                        END,
      'timerRunning',   b.timer_running,
      'timerStartedAt', to_char(b.timer_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'timerEndsAt',    to_char(b.timer_ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'votingEnabled',  b.voting_enabled,
      'votingAllowed',  b.voting_allowed,
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
                    'votes',      (SELECT COUNT(*) FROM note_votes nv WHERE nv.note_id = n.id),
                    'user_voted', CASE
                                    WHEN $2::uuid IS NOT NULL
                                    THEN EXISTS(SELECT 1 FROM note_votes nv WHERE nv.note_id = n.id AND nv.user_id = $2::uuid)
                                    ELSE FALSE
                                  END,
                    'is_new',     n.is_new,
                    'created',    n.created,
                    'note_order', n.note_order
                  )
                  ORDER BY n.note_order, n.created
                )
                FROM notes n
                WHERE n.column_id = c.id
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
    WHERE b.id = $1
    GROUP BY b.id
    `,
    [id, userId ?? null]
  );

  if (res.rowCount === 0) return null;
  return res.rows[0].board as BoardDTO;
}

// ---------------------------------------------------------------------------
// WRITE — each function is called by its own resource route action
// ---------------------------------------------------------------------------

export async function createBoard(
  title: string = "Untitled",
  userId: string | null = null
): Promise<string> {
  const client = await pool.connect();
  const id = crypto.randomUUID();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO boards (id, title, created_by) VALUES ($1, $2, $3)`,
      [id, title, userId]
    );

    if (userId) {
      await client.query(
        `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [id, userId]
      );
    }

    const defaultColumns = ["What went well?", "What can we do better?", "Action items"];
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

export async function addColumnServer(
  boardId: string,
  id: string,
  title: string,
  colOrder: number
) {
  await pool.query(
    `INSERT INTO columns (id, board_id, title, col_order) VALUES ($1, $2, $3, $4)`,
    [id, boardId, title, colOrder]
  );
  return getBoardServer(boardId);
}

export async function updateColumnTitleServer(
  boardId: string,
  columnId: string,
  newTitle: string
) {
  await pool.query(`UPDATE columns SET title = $1 WHERE id = $2`, [newTitle, columnId]);
  return getBoardServer(boardId);
}

export async function updateColumnPromptServer(
  boardId: string,
  columnId: string,
  prompt: string
) {
  await pool.query(`UPDATE columns SET prompt = $1 WHERE id = $2`, [prompt, columnId]);
  return getBoardServer(boardId);
}

export async function deleteColumnServer(boardId: string, columnId: string) {
  await pool.query(`DELETE FROM columns WHERE id = $1`, [columnId]);
  return getBoardServer(boardId);
}

export async function upsertNoteServer(
  boardId: string,
  noteId: string,
  columnId: string,
  newText: string,
  likes: number,
  created: string
) {
  await pool.query(
    `
    INSERT INTO notes (id, column_id, text, likes, is_new, created, note_order)
    VALUES ($1, $2, $3, $4, false, $5, COALESCE((SELECT MAX(note_order) + 1 FROM notes WHERE column_id = $2), 0))
    ON CONFLICT (id) DO UPDATE
    SET
      text   = EXCLUDED.text,
      is_new = false,
      likes  = CASE
                 WHEN notes.likes > EXCLUDED.likes THEN notes.likes + 1
                 ELSE EXCLUDED.likes
               END
    `,
    [noteId, columnId, newText, likes, created]
  );
  return getBoardServer(boardId);
}

export async function likeNoteServer(boardId: string, noteId: string, delta: number) {
  await pool.query(`UPDATE notes SET likes = likes + $1 WHERE id = $2`, [delta, noteId]);
  return getBoardServer(boardId);
}

export async function voteNoteServer(boardId: string, noteId: string, userId: string) {
  // Try to insert. If the row already exists (user already voted), delete it instead.
  const insert = await pool.query(
    `INSERT INTO note_votes (note_id, user_id) VALUES ($1, $2) ON CONFLICT (note_id, user_id) DO NOTHING`,
    [noteId, userId]
  );
  if (insert.rowCount === 0) {
    // Vote existed — remove it (toggle off)
    await pool.query(`DELETE FROM note_votes WHERE note_id = $1 AND user_id = $2`, [noteId, userId]);
  }
  return getBoardServer(boardId, userId);
}

export async function updateBoardSettingsServer(
  boardId: string,
  votingEnabled: boolean,
  votingAllowed: number
) {
  await pool.query(
    `UPDATE boards SET voting_enabled = $1, voting_allowed = $2 WHERE id = $3`,
    [votingEnabled, votingAllowed, boardId]
  );
  return getBoardServer(boardId);
}

export async function clearBoardVotesServer(boardId: string) {
  await pool.query(
    `DELETE FROM note_votes WHERE note_id IN (SELECT n.id FROM notes n JOIN columns c ON c.id = n.column_id WHERE c.board_id = $1)`,
    [boardId]
  );
  await pool.query(
    `UPDATE notes SET likes = 0 WHERE column_id IN (SELECT id FROM columns WHERE board_id = $1)`,
    [boardId]
  );
}

export async function deleteNoteServer(boardId: string, columnId: string, noteId: string) {
  await pool.query(`DELETE FROM notes WHERE id = $1`, [noteId]);
  return getBoardServer(boardId);
}

export async function moveNoteServer(
  boardId: string,
  fromColumnId: string,
  toColumnId: string,
  noteId: string
) {
  await pool.query(`UPDATE notes SET column_id = $1 WHERE id = $2`, [toColumnId, noteId]);
  return getBoardServer(boardId);
}

export async function reorderNotesServer(
  boardId: string,
  toColumnId: string,
  orderedNoteIds: string[]
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
  return getBoardServer(boardId);
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
      `SELECT title, voting_enabled, voting_allowed FROM boards WHERE id = $1`,
      [boardId]
    );
    if (boardRes.rowCount === 0) throw new Error("Board not found");
    const { title, voting_enabled, voting_allowed } = boardRes.rows[0];
    const newTitle = `${title} (copy)`;

    // Create the new board (copy voting settings)
    await client.query(
      `INSERT INTO boards (id, title, created_by, voting_enabled, voting_allowed) VALUES ($1, $2, $3, $4, $5)`,
      [newId, newTitle, userId, voting_enabled, voting_allowed]
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

export async function updateBoardTitleServer(boardId: string, newTitle: string) {
  await pool.query(`UPDATE boards SET title = $1 WHERE id = $2`, [newTitle, boardId]);
  return getBoardServer(boardId);
}
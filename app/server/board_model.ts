// ---------------------------------------------------------------------------
// board_model.ts — pure DB access. Returns DTOs. No client concerns.
// ---------------------------------------------------------------------------

import { pool } from "./db_config";
import "./db_init";
import type { BoardDTO } from "./board.types";

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

export async function getBoardServer(id: string): Promise<BoardDTO | null> {
  const res = await pool.query(
    `
    SELECT json_build_object(
      'id',             b.id,
      'title',          b.title,
      'readonly',       false,
      'timerRunning',   b.timer_running,
      'timerStartedAt', to_char(b.timer_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'timerEndsAt',    to_char(b.timer_ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'columns', COALESCE(
        json_agg(
          json_build_object(
            'id',        c.id,
            'title',     c.title,
            'col_order', c.col_order,
            'notes', COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id',      n.id,
                    'text',    n.text,
                    'likes',   n.likes,
                    'is_new',  n.is_new,
                    'created', n.created
                  )
                  ORDER BY n.created
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
    [id]
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
    INSERT INTO notes (id, column_id, text, likes, is_new, created)
    VALUES ($1, $2, $3, $4, false, $5)
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

export async function updateBoardTitleServer(boardId: string, newTitle: string) {
  await pool.query(`UPDATE boards SET title = $1 WHERE id = $2`, [newTitle, boardId]);
  return getBoardServer(boardId);
}
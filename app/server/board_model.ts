import { pool } from "./db_config";
import "./db_init"; // init the db, migrations, etc.

import type { BoardState } from "./board.types";

// ---------- QUERIES ----------

// Get a board by ID
export async function getBoardServer(id: string): Promise<BoardState | null> {
  const res = await pool.query(
    `
    SELECT json_build_object(
      'id', b.id,
      'title', b.title,
      'timerRunning', b.timer_running,
      'timerStartedAt', b.timer_started_at,
      'timerEndsAt', b.timer_ends_at,
      'columns', COALESCE(
        json_agg(
          json_build_object(
            'id', c.id,
            'title', c.title,
            'col_order', c.col_order,
            'notes', COALESCE(
              (SELECT json_agg(
                 json_build_object(
                   'id', n.id,
                   'text', n.text,
                   'likes', n.likes,
                   'is_new', n.is_new,
                   'created', n.created
                 ) ORDER BY n.created
               )
               FROM notes n
               WHERE n.column_id = c.id
              ), '[]'::json)
          ) ORDER BY c.col_order
        ) FILTER (WHERE c.id IS NOT NULL), '[]'::json
      )
    ) AS board
    FROM boards b
    LEFT JOIN columns c ON c.board_id = b.id
    WHERE b.id = $1
    GROUP BY b.id, b.title
    `,
    [id]
  );

  if (res.rowCount === 0) return null;
  return res.rows[0].board as BoardState;
}

// Create a new board
export async function createBoard(
  title: string = 'Untitled',
  userId: string | null = null,
): Promise<string> {
  const client = await pool.connect();
  const id = crypto.randomUUID();

  try {
    await client.query("BEGIN");

    // Create board
    await client.query(
      `
      INSERT INTO boards (id, title, created_by)
      VALUES ($1, $2, $3)
      `,
      [id, title, userId]
    );

    // Add membership as owner
    if (userId) {
      await client.query(
        `
        INSERT INTO board_members (board_id, user_id, role)
        VALUES ($1, $2, 'owner')
        `,
        [id, userId]
      );
    }

    // Add 3 columns by default
    await Promise.allSettled(
      [
        'What went well?',
        'What can we do better?',
        'Action Items'
      ].map((colTitle, index) => client.query(
        `INSERT INTO columns (id, board_id, title, col_order) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), id, colTitle, index + 1]
      ))
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return id;
}


// Add a column
export async function addColumnServer(boardId: string, id: string, title: string, col_order: number): Promise<void> {
  await pool.query(
    `INSERT INTO columns (id, board_id, title, col_order) VALUES ($1, $2, $3, $4)`,
    [id, boardId, title, col_order]
  );
}

// Update column title
export async function updateColumnTitleServer(boardId: string, colId: string, newTitle: string): Promise<void> {
  await pool.query(
    `UPDATE columns SET title = $1 WHERE id = $2 AND board_id = $3`,
    [newTitle, colId, boardId]
  );
}

// Delete column
export async function deleteColumnServer(boardId: string, colId: string): Promise<void> {
  await pool.query(
    `DELETE FROM columns WHERE id = $1 AND board_id = $2`,
    [colId, boardId]
  );
}

// Add a note
export async function addNoteServer(noteId: string, columnId: string, text: string = "", created: string): Promise<void> {
  await pool.query(
    `INSERT INTO notes (id, column_id, text, likes, is_new) VALUES ($1, $2, $3, 0, false, $4)`,
    [noteId, columnId, text, created]
  );
}

// Update or insert a note
export async function updateNoteServer(columnId: string, noteId: string, newText: string, likeCount: number, created: string): Promise<void> {
  // Updates the record but if saved likes are larger than likeCount, increment saved likes by 1 instead
  await pool.query(`
    INSERT INTO notes (id, column_id, text, likes, is_new, created)
    VALUES ($1, $2, $3, $4, false, $5)
    ON CONFLICT (id) DO UPDATE
    SET 
      text = EXCLUDED.text,
      likes = CASE
        WHEN notes.likes > EXCLUDED.likes THEN notes.likes + 1
        ELSE EXCLUDED.likes
      END
    `,
    [noteId, columnId, newText, likeCount, created]
  );
}

// Like a note (increment likes)
export async function likeNoteServer(noteId: string, delta: number): Promise<void> {
  await pool.query(
    `UPDATE notes SET likes = likes + $1 WHERE id = $2`,
    [delta, noteId]
  );
}

// Delete a note
export async function deleteNoteServer(columnId: string, noteId: string): Promise<void> {
  await pool.query(
    `DELETE FROM notes WHERE id = $1 AND column_id = $2`,
    [noteId, columnId]
  );
}

// Move a note (reassign column_id)
export async function moveNoteServer(fromColId: string, toColId: string, noteId: string): Promise<void> {
  if (fromColId === toColId) return;
  await pool.query(
    `UPDATE notes SET column_id = $1 WHERE id = $2 AND column_id = $3`,
    [toColId, noteId, fromColId]
  );
}

export async function startTimerServer(
  boardId: string,
  durationSeconds: number
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔒 Lock the board row
    const res = await client.query(
      `SELECT timer_running FROM boards WHERE id = $1 FOR UPDATE`,
      [boardId]
    );

    if (res.rowCount === 0) {
      throw new Error("Board not found");
    }

    // Don't start if already running
    if (res.rows[0].timer_running) {
      throw new Error("TIMER_ALREADY_RUNNING");
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();

    await client.query(`
      UPDATE boards
      SET
        timer_running = true,
        timer_started_at = $1,
        timer_ends_at = $2
      WHERE id = $3
    `, [now, endsAt, boardId]);

    await client.query("COMMIT");

    // return {
    //   timer_running: true,
    //   timer_ends_at: endsAt.toISOString(),
    // };
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
  await pool.query(`
    UPDATE boards
    SET
      timer_running = false,
      timer_started_at = NULL,
      timer_ends_at = NULL
    WHERE id = $1
  `, [boardId]);
}


import { nanoid } from "nanoid";
import { pool } from "./db_config";
import type { BoardState } from "./board.types";

// ---------- QUERIES ----------

// Get a board by ID
export async function getBoardServer(id: string): Promise<BoardState | null> {
  const res = await pool.query(
    `
    SELECT json_build_object(
      'id', b.id,
      'title', b.title,
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
export async function createBoard(id: string, title: string): Promise<void> {
  await pool.query(
    `INSERT INTO boards (id, title) VALUES ($1, $2)`,
    [id, title]
  );

  // Add default first column
  await pool.query(
    `INSERT INTO columns (id, board_id, title, col_order) VALUES ($1, $2, 'Column 1', 1)`,
    [nanoid(), id]
  );
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
  await pool.query(
    `INSERT INTO notes (id, column_id, text, likes, is_new, created)
     VALUES ($1, $2, $3, $4, false, $5)
     ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, likes = EXCLUDED.likes`,
    [noteId, columnId, newText, likeCount, created]
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

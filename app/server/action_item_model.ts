// app/server/action_item_model.ts
// Database operations for action items (issues #88 + #72). All queries use
// parameterized SQL. Items are board-level (board_id set) or team-level
// (team_id set) — never both.
//
// Board-scoped mutations return the full BoardDTO (matching the resource-route
// convention used by notes/columns) so BoardContext can sync in one hop.
// Team-scoped functions return plain rows; team pages revalidate via loaders.

import { pool } from "./db_config";
import { getBoardServer } from "./board_model";
import type { ActionItemDTO, BoardDTO } from "./board.types";

// ---------------------------------------------------------------------------
// Board-level
// ---------------------------------------------------------------------------

export async function createBoardActionItem(
  boardId: string,
  text: string,
  userId: string | null
): Promise<BoardDTO | null> {
  await pool.query(
    `INSERT INTO action_items (board_id, text, created_by, item_order)
     VALUES ($1, $2, $3,
       COALESCE((SELECT MAX(item_order) + 1 FROM action_items WHERE board_id = $1), 0))`,
    [boardId, text, userId]
  );
  return getBoardServer(boardId, userId);
}

export async function bulkCreateBoardActionItems(
  boardId: string,
  texts: string[],
  userId: string | null
): Promise<BoardDTO | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const start = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(item_order) + 1, 0) AS next FROM action_items WHERE board_id = $1`,
      [boardId]
    );
    let order = Number(start.rows[0].next);
    for (const text of texts) {
      await client.query(
        `INSERT INTO action_items (board_id, text, created_by, item_order)
         VALUES ($1, $2, $3, $4)`,
        [boardId, text, userId, order]
      );
      order += 1;
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

export async function updateActionItemText(
  boardId: string,
  itemId: string,
  text: string,
  userId: string | null
): Promise<BoardDTO | null> {
  await pool.query(
    `UPDATE action_items SET text = $1 WHERE id = $2 AND board_id = $3`,
    [text, itemId, boardId]
  );
  return getBoardServer(boardId, userId);
}

export async function setActionItemCompleted(
  boardId: string,
  itemId: string,
  completed: boolean,
  userId: string | null
): Promise<BoardDTO | null> {
  await pool.query(
    `UPDATE action_items
     SET completed = $1, completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END
     WHERE id = $2 AND board_id = $3`,
    [completed, itemId, boardId]
  );
  return getBoardServer(boardId, userId);
}

export async function deleteActionItemServer(
  boardId: string,
  itemId: string,
  userId: string | null
): Promise<BoardDTO | null> {
  await pool.query(
    `DELETE FROM action_items WHERE id = $1 AND board_id = $2`,
    [itemId, boardId]
  );
  return getBoardServer(boardId, userId);
}

// ---------------------------------------------------------------------------
// Team-level
// ---------------------------------------------------------------------------

export async function listTeamActionItems(teamId: string): Promise<ActionItemDTO[]> {
  const res = await pool.query(
    `SELECT id, text, completed, item_order, created_at, completed_at, team_id
     FROM action_items
     WHERE team_id = $1
     ORDER BY completed ASC, item_order, created_at`,
    [teamId]
  );
  return res.rows as ActionItemDTO[];
}

/** Open action items on the team's boards, with board context for rollup display. */
export async function listTeamBoardActionItems(
  teamId: string
): Promise<(ActionItemDTO & { board_title: string })[]> {
  const res = await pool.query(
    `SELECT ai.id, ai.text, ai.completed, ai.item_order, ai.created_at,
            ai.completed_at, ai.board_id, b.title AS board_title
     FROM action_items ai
     JOIN boards b ON b.id = ai.board_id
     WHERE b.team_id = $1 AND NOT ai.completed
     ORDER BY b.title, ai.item_order, ai.created_at`,
    [teamId]
  );
  return res.rows as (ActionItemDTO & { board_title: string })[];
}

export async function createTeamActionItem(
  teamId: string,
  text: string,
  userId: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO action_items (team_id, text, created_by, item_order)
     VALUES ($1, $2, $3,
       COALESCE((SELECT MAX(item_order) + 1 FROM action_items WHERE team_id = $1), 0))`,
    [teamId, text, userId]
  );
}

export async function setTeamActionItemCompleted(
  teamId: string,
  itemId: string,
  completed: boolean
): Promise<void> {
  await pool.query(
    `UPDATE action_items
     SET completed = $1, completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END
     WHERE id = $2 AND team_id = $3`,
    [completed, itemId, teamId]
  );
}

export async function deleteTeamActionItem(
  teamId: string,
  itemId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM action_items WHERE id = $1 AND team_id = $2`,
    [itemId, teamId]
  );
}

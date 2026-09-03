import { type ActionFunctionArgs } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { pool } from "~/server/db_config";
import { ensurePersonalTeam } from "~/server/team_model";

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireRegisteredUser(request);
  const formData = await request.formData();
  const boardLink = formData.get("boardLink")?.toString().trim() ?? "";

  const match = boardLink.match(/\/board\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    return { error: "Invalid board link. Please check the URL and try again." };
  }

  const boardId = match[1];

  const boardResult = await pool.query(
    `SELECT bm.user_id as owner_id
     FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.role = 'owner'
     WHERE b.id = $1`,
    [boardId]
  );

  if (boardResult.rowCount === 0) {
    return { error: "Board not found." };
  }

  const { owner_id } = boardResult.rows[0];

  // GAP-002: the only thing that matters is whether an owner row exists.
  // `created_by` is attribution, not ownership — the API trial path sets it
  // to the agent that created the board, and that board must still be
  // claimable (it's the whole point of the conversion path, BRD-020/DASH-016).
  const hasOwner = !!owner_id;

  if (hasOwner) {
    return { error: "This board already has an owner and cannot be claimed." };
  }

  // BRD-020/DASH-016: claiming assigns the board to the claimer's personal
  // crew, in the same transaction as the owner insert.
  const teamId = await ensurePersonalTeam(user.id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO board_members (board_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (board_id, user_id) DO UPDATE SET role = 'owner'`,
      [boardId, user.id]
    );

    // Deliberately NOT touching open_facilitation here — this is the one
    // place a crewless->crew transition differs from
    // moveBoardsToTeamServer's. A claim must not yank the Command Deck away
    // from everyone mid-retro; the board keeps whatever facilitation state
    // it had, and the new owner can close it deliberately via Crew Access,
    // which becomes available to them once the board is on a crew. Do not
    // "fix" this to match moveBoardsToTeamServer.
    await client.query(
      `UPDATE boards SET team_id = $1 WHERE id = $2`,
      [teamId, boardId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { success: true };
}
import { type ActionFunctionArgs } from "react-router";
import { requireUser } from "~/hooks/useAuth";
import { pool } from "~/server/db_config";

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const boardLink = formData.get("boardLink")?.toString().trim() ?? "";

  const match = boardLink.match(/\/board\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    return { error: "Invalid board link. Please check the URL and try again." };
  }

  const boardId = match[1];

  const boardResult = await pool.query(
    `SELECT b.created_by, bm.user_id as owner_id
     FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.role = 'owner'
     WHERE b.id = $1`,
    [boardId]
  );

  if (boardResult.rowCount === 0) {
    return { error: "Board not found." };
  }

  const { owner_id, created_by } = boardResult.rows[0];

  const hasOwner = !!owner_id;
  const isAnonymousCreator = !created_by;

  if (hasOwner || !isAnonymousCreator) {
    return { error: "This board already has an owner and cannot be claimed." };
  }

  await pool.query(
    `INSERT INTO board_members (board_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (board_id, user_id) DO UPDATE SET role = 'owner'`,
    [boardId, user.id]
  );

  return { success: true };
}
// routes/app/board.attachments.ts
// Resource route — no UI. Handles attachment mutations.
// GET    → list attachments for a board
// POST   → add a link or image attachment (owner only)
// DELETE → remove an attachment (owner only)

import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { getOptionalUser } from "~/hooks/useAuth";
import {
  getAttachmentsServer,
  addLinkAttachmentServer,
  addImageAttachmentServer,
  deleteAttachmentServer,
} from "~/server/attachment_model";
import { pool } from "~/server/db_config";

async function requireOwner(request: Request, boardId: string) {
  const user = await getOptionalUser(request);
  if (!user) throw new Response("Unauthorized", { status: 401 });

  const res = await pool.query(
    `SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, user.id]
  );
  if (res.rowCount === 0 || res.rows[0].role !== "owner") {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export async function loader({ params }: LoaderFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  return Response.json(await getAttachmentsServer(boardId));
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  await requireOwner(request, boardId);
  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "POST": {
      const type = data.get("type") as string;
      const filename = data.get("filename") as string;

      if (!filename) throw new Response("Filename is required", { status: 422 });

      if (type === "image") {
        const imageData = data.get("imageData") as string;
        if (!imageData) throw new Response("Image data is required", { status: 422 });

        try {
          return Response.json(await addImageAttachmentServer(boardId, filename, imageData));
        } catch (err) {
          const message = (err as Error).message;
          if (message.includes("Maximum") || message.includes("exceeds")) {
            throw new Response(message, { status: 422 });
          }
          throw err;
        }
      } else {
        const link = data.get("link") as string;
        if (!link) throw new Response("Link is required", { status: 422 });
        return Response.json(await addLinkAttachmentServer(boardId, filename, link));
      }
    }

    case "DELETE": {
      const attachmentId = data.get("attachmentId") as string;
      if (!attachmentId) throw new Response("Attachment ID is required", { status: 422 });
      return Response.json(await deleteAttachmentServer(boardId, attachmentId));
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}

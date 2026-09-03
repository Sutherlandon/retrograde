// routes/app/board.attachments.ts
// Resource route — no UI. Handles attachment mutations.
// GET    → list attachments for a board
// POST   → add a link or image attachment (facilitators — ADR-0006)
// DELETE → remove an attachment (facilitators — ADR-0006)

import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import {
  getAttachmentsServer,
  addLinkAttachmentServer,
  addImageAttachmentServer,
  deleteAttachmentServer,
} from "~/server/attachment_model";
import { requireBoardAccess, requireFacilitator } from "~/server/board_permissions";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  // BRD-019: attachment metadata for a members-only board was previously
  // readable by anyone holding the board id.
  await requireBoardAccess(request, boardId);

  return Response.json(await getAttachmentsServer(boardId));
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  await requireFacilitator(request, boardId);
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

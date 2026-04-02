// ---------------------------------------------------------------------------
// attachment_model.ts — DB access for board attachments
// ---------------------------------------------------------------------------

import { pool } from "./db_config";
import type { AttachmentDTO } from "./board.types";

const MAX_IMAGE_SIZE = 250_000; // 250KB
const MAX_IMAGE_UPLOADS = 5;

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

export async function getAttachmentsServer(boardId: string): Promise<AttachmentDTO[]> {
  const res = await pool.query(
    `SELECT id, board_id, filename, link, type, image_data, created_at
     FROM attachments
     WHERE board_id = $1
     ORDER BY created_at ASC`,
    [boardId]
  );
  return res.rows as AttachmentDTO[];
}

// ---------------------------------------------------------------------------
// WRITE
// ---------------------------------------------------------------------------

export async function addLinkAttachmentServer(
  boardId: string,
  filename: string,
  link: string
): Promise<AttachmentDTO[]> {
  await pool.query(
    `INSERT INTO attachments (id, board_id, filename, link, type)
     VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
    [boardId, filename, link, "link"]
  );
  return getAttachmentsServer(boardId);
}

export async function addImageAttachmentServer(
  boardId: string,
  filename: string,
  imageData: string
): Promise<AttachmentDTO[]> {
  // Validate size
  if (imageData.length > MAX_IMAGE_SIZE) {
    throw new Error("Image data exceeds maximum size of 250KB");
  }

  // Check image count limit
  const countRes = await pool.query(
    `SELECT COUNT(*) as count FROM attachments WHERE board_id = $1 AND type = 'image'`,
    [boardId]
  );
  if (parseInt(countRes.rows[0].count, 10) >= MAX_IMAGE_UPLOADS) {
    throw new Error("Maximum of 5 uploaded images per board");
  }

  await pool.query(
    `INSERT INTO attachments (id, board_id, filename, link, type, image_data)
     VALUES (gen_random_uuid(), $1, $2, NULL, $3, $4)`,
    [boardId, filename, "image", imageData]
  );
  return getAttachmentsServer(boardId);
}

export async function deleteAttachmentServer(
  boardId: string,
  attachmentId: string
): Promise<AttachmentDTO[]> {
  await pool.query(
    `DELETE FROM attachments WHERE id = $1 AND board_id = $2`,
    [attachmentId, boardId]
  );
  return getAttachmentsServer(boardId);
}

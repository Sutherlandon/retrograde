import { useState } from "react";
import { useBoard } from "~/context/BoardContext";
import { CloseIcon } from "~/images/icons";
import type { Attachment } from "~/server/board.types";

// ---------------------------------------------------------------------------
// File-type icon colors and labels derived from filename extension
// ---------------------------------------------------------------------------

interface FileTypeInfo {
  label: string;
  bgColor: string;
  textColor: string;
}

function getFileTypeInfo(filename: string): FileTypeInfo {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  switch (ext) {
    case "pdf":
      return { label: "PDF", bgColor: "bg-red-500", textColor: "text-white" };
    case "doc":
    case "docx":
      return { label: "DOC", bgColor: "bg-blue-600", textColor: "text-white" };
    case "xls":
    case "xlsx":
      return { label: "XLS", bgColor: "bg-green-600", textColor: "text-white" };
    case "md":
    case "markdown":
      return { label: "MD", bgColor: "bg-purple-600", textColor: "text-white" };
    default:
      return { label: "FILE", bgColor: "bg-gray-500", textColor: "text-white" };
  }
}

// ---------------------------------------------------------------------------
// File icon component
// ---------------------------------------------------------------------------

function FileTypeIcon({ filename }: { filename: string }) {
  const { label, bgColor, textColor } = getFileTypeInfo(filename);
  return (
    <div
      className={`${bgColor} ${textColor} w-10 h-10 rounded flex items-center justify-center text-xs font-bold shrink-0`}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm delete dialog
// ---------------------------------------------------------------------------

function ConfirmDeleteDialog({
  filename,
  onConfirm,
  onCancel,
}: {
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-sm font-semibold mb-2">Delete Attachment</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Are you sure you want to delete <strong>{filename}</strong>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image preview modal
// ---------------------------------------------------------------------------

function ImagePreviewModal({
  filename,
  imageData,
  onClose,
}: {
  filename: string;
  imageData: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl max-h-[90vh] mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold truncate">{filename}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer shrink-0 ml-4"
          >
            <CloseIcon size="md" />
          </button>
        </div>
        <div className="p-4 overflow-auto">
          <img
            src={imageData}
            alt={filename}
            className="max-w-full max-h-[75vh] mx-auto rounded"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single attachment row
// ---------------------------------------------------------------------------

function AttachmentItem({
  attachment,
  isOwner,
  onDelete,
  onImageClick,
}: {
  attachment: Attachment;
  isOwner: boolean;
  onDelete: (id: string) => void;
  onImageClick: (attachment: Attachment) => void;
}) {
  const isImage = attachment.type === "image" && attachment.image_data;

  const content = (
    <>
      {/* Icon or thumbnail */}
      {isImage ? (
        <img
          src={attachment.image_data!}
          alt={attachment.filename}
          className="w-10 h-10 rounded object-cover shrink-0"
        />
      ) : (
        <FileTypeIcon filename={attachment.filename} />
      )}

      {/* Filename */}
      <span className="text-sm truncate flex-1">{attachment.filename}</span>

      {/* Delete button (owner only, visible on hover) */}
      {isOwner && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(attachment.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 transition-all cursor-pointer"
          title="Delete attachment"
        >
          <CloseIcon size="sm" />
        </button>
      )}
    </>
  );

  if (isImage) {
    return (
      <button
        type="button"
        onClick={() => onImageClick(attachment)}
        className="group flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer text-left w-full"
      >
        {content}
      </button>
    );
  }

  return (
    <a
      href={attachment.link ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      {content}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main attachments list
// ---------------------------------------------------------------------------

export function AttachmentsList() {
  const { attachments, isOwner, deleteAttachment } = useBoard();
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const [previewImage, setPreviewImage] = useState<Attachment | null>(null);

  if (attachments.length === 0) return null;

  function handleConfirmDelete() {
    if (deleteTarget) {
      deleteAttachment(deleteTarget.id);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-3">Attachments</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
        {attachments.map((attachment) => (
          <AttachmentItem
            key={attachment.id}
            attachment={attachment}
            isOwner={isOwner}
            onDelete={() => setDeleteTarget(attachment)}
            onImageClick={setPreviewImage}
          />
        ))}
      </div>

      {deleteTarget && (
        <ConfirmDeleteDialog
          filename={deleteTarget.filename}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {previewImage && previewImage.image_data && (
        <ImagePreviewModal
          filename={previewImage.filename}
          imageData={previewImage.image_data}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { EllipsisIcon, CopyIcon, TrashIcon, ArchiveIcon } from "~/images/icons";

interface BoardActionsMenuProps {
  boardId: string;
  boardTitle: string;
  isOwner: boolean;
  isArchived: boolean;
}

export function BoardActionsMenu({ boardId, boardTitle, isOwner, isArchived }: BoardActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close confirm dialog on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (confirmDelete && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [confirmDelete]);

  function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    fetcher.submit(
      { intent: "duplicate", boardId },
      { method: "post" }
    );
  }

  function handleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    fetcher.submit(
      { intent: isArchived ? "unarchive" : "archive", boardId },
      { method: "post" }
    );
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    setConfirmDelete(true);
  }

  function handleConfirmDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDelete(false);
    fetcher.submit(
      { intent: "delete", boardId },
      { method: "post" }
    );
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDelete(false);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
          setConfirmDelete(false);
        }}
        className="p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors cursor-pointer"
      >
        <EllipsisIcon size="md" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-52 rounded-md border bg-white dark:bg-gray-800 border-blue-500 shadow-lg z-50 overflow-hidden">
          <button
            type="button"
            onClick={handleDuplicate}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <span className="text-gray-500 dark:text-gray-400"><CopyIcon size="sm" /></span>
            Duplicate Board
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={handleArchive}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <span className="text-gray-500 dark:text-gray-400"><ArchiveIcon size="sm" /></span>
              {isArchived ? "Unarchive Board" : "Archive Board"}
            </button>
          )}
          {isOwner && !isArchived && (
            <>
            <hr className="border-gray-200 dark:border-gray-700" />
            <button
              type="button"
              onClick={handleDeleteClick}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <span><TrashIcon size="sm" /></span>
              Delete Board
            </button>
            </>
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="absolute right-0 mt-1 w-72 rounded-md border bg-white dark:bg-gray-800 border-blue-500 shadow-lg z-50 overflow-hidden p-4 text-center">
          <p className="text-sm font-medium mb-1">Delete "{boardTitle}"?</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            This action cannot be undone.
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-3 py-1.5 text-sm rounded bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleCancelDelete}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

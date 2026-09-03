import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFetcher } from "react-router";
import { EllipsisIcon, CopyIcon, TrashIcon, ArchiveIcon, AstronautIcon } from "~/images/icons";
import type { TeamSummary } from "~/server/team_model";

// The table this menu lives in scrolls horizontally (overflow-x-auto), which
// per the CSS spec forces overflow-y to compute as auto too — there is no
// way to opt a single axis back to `visible`. An absolutely-positioned
// dropdown inside that box gets clipped at the table's bottom edge, worst
// when there's only one row. Portaling to document.body with a
// viewport-fixed position sidesteps the ancestor's overflow entirely.
interface MenuPosition {
  top: number;
  right: number;
}

interface BoardActionsMenuProps {
  boardId: string;
  boardTitle: string;
  isOwner: boolean;
  isArchived: boolean;
  /** When provided (dashboard), owners get a "Move to Team" submenu. */
  teams?: TeamSummary[];
  currentTeamId?: string | null;
}

export function BoardActionsMenu({ boardId, boardTitle, isOwner, isArchived, teams, currentTeamId }: BoardActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTeamList, setShowTeamList] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();

  function positionFromButton(): MenuPosition | null {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { top: rect.bottom + 4, right: window.innerWidth - rect.right };
  }

  const anyOpen = open || confirmDelete;

  // Close on outside click — the panel is portaled to document.body, so it
  // is checked alongside the trigger button.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        anyOpen &&
        menuRef.current && !menuRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [anyOpen]);

  // The panel is viewport-fixed, so it doesn't track a scrolling ancestor —
  // close it instead of letting it drift away from the button. `capture:
  // true` catches the table's own horizontal scroll, not just the window's.
  useEffect(() => {
    if (!anyOpen) return;
    function handleScroll() {
      setOpen(false);
      setConfirmDelete(false);
    }
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [anyOpen]);

  function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    fetcher.submit(
      { intent: "duplicate", boardId },
      { method: "post" }
    );
  }

  function handleMoveToTeam(e: React.MouseEvent, teamId: string) {
    e.stopPropagation();
    setOpen(false);
    setShowTeamList(false);
    fetcher.submit(
      { intent: "moveBoard", boardId, teamId },
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
        ref={buttonRef}
        type="button"
        aria-label="Board actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => {
            const next = !o;
            if (next) setMenuPos(positionFromButton());
            return next;
          });
          setConfirmDelete(false);
          setShowTeamList(false);
        }}
        className="p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors cursor-pointer"
      >
        <EllipsisIcon size="md" />
      </button>

      {open && showTeamList && teams && menuPos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
          className="w-52 rounded-md border bg-white dark:bg-gray-800 border-blue-500 shadow-lg z-50 overflow-hidden"
        >
          <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500">
            Move to
          </p>
          {teams.filter((t) => t.id !== currentTeamId).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={(e) => handleMoveToTeam(e, t.id)}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <span className="text-gray-500 dark:text-gray-400"><AstronautIcon size="sm" /></span>
              {t.name}
            </button>
          ))}
          {currentTeamId && (
            <>
              <hr className="border-gray-200 dark:border-gray-700" />
              <button
                type="button"
                onClick={(e) => handleMoveToTeam(e, "none")}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left text-amber-600 dark:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Remove from crew
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {open && !showTeamList && menuPos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
          className="w-52 rounded-md border bg-white dark:bg-gray-800 border-blue-500 shadow-lg z-50 overflow-hidden"
        >
          <button
            type="button"
            onClick={handleDuplicate}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <span className="text-gray-500 dark:text-gray-400"><CopyIcon size="sm" /></span>
            Duplicate Board
          </button>
          {isOwner && teams && !isArchived && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTeamList(true);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <span className="text-gray-500 dark:text-gray-400"><AstronautIcon size="sm" /></span>
              Move to Crew
            </button>
          )}
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
        </div>,
        document.body
      )}

      {confirmDelete && menuPos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
          className="w-72 rounded-md border bg-white dark:bg-gray-800 border-blue-500 shadow-lg z-50 overflow-hidden p-4 text-center"
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}

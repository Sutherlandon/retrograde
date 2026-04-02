import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useBoard } from "~/context/BoardContext";
import { CloseIcon } from "~/images/icons";
import type { BoardDTO } from "~/server/board.types";

interface BoardSettingsModalProps {
  onClose: () => void;
}

export function BoardSettingsModal({ onClose }: BoardSettingsModalProps) {
  const { id: boardId, votingEnabled, votingAllowed, notesLocked, boardLocked, updateBoardSettings } = useBoard();
  const clearFetcher = useFetcher();

  const [localEnabled, setLocalEnabled] = useState(votingEnabled);
  const [localAllowed, setLocalAllowed] = useState<number | string>(votingAllowed);
  const [localNotesLocked, setLocalNotesLocked] = useState(notesLocked);
  const [localBoardLocked, setLocalBoardLocked] = useState(boardLocked);
  const [showClearWarning, setShowClearWarning] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Resolve empty string to 1 for saving
  const resolvedAllowed: number = localAllowed === "" ? 1 : localAllowed as number;

  // When the clear fetcher completes, save the new settings
  useEffect(() => {
    if (clearFetcher.data) {
      updateBoardSettings({ votingEnabled: true, votingAllowed: resolvedAllowed, notesLocked: localNotesLocked, boardLocked: localBoardLocked });
      onClose();
    }
  }, [clearFetcher.data]);

  function handleToggleVoting(enabled: boolean) {
    setLocalEnabled(enabled);
    if (enabled && !votingEnabled) {
      // Turning on — show warning about clearing likes
      setShowClearWarning(true);
    } else if (!enabled) {
      setShowClearWarning(false);
    }
  }

  function handleSave() {
    if (showClearWarning) {
      // User clicked save while warning is shown — they already saw it; confirm
      handleConfirmClear();
    } else {
      updateBoardSettings({ votingEnabled: localEnabled, votingAllowed: resolvedAllowed, notesLocked: localNotesLocked, boardLocked: localBoardLocked });
      onClose();
    }
  }

  function handleConfirmClear() {
    // Clear all likes/votes on the server, then save settings
    clearFetcher.submit(
      {},
      { method: "POST", action: `/app/board/${boardId}/settings` }
    );
  }

  function handleCancelClear() {
    setLocalEnabled(false);
    setShowClearWarning(false);
  }

  const isSaving = clearFetcher.state !== "idle";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Board Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <CloseIcon size="md" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Voting toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Voting System</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Replace likes with a limited vote counter
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={localEnabled}
              onClick={() => handleToggleVoting(!localEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none
                ${localEnabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform
                  ${localEnabled ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          {/* Votes allowed */}
          {localEnabled && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Votes per person</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  How many votes each participant can cast
                </p>
              </div>
              <input
                type="number"
                min={1}
                max={99}
                value={localAllowed}
                onChange={(e) => setLocalAllowed(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))}
                className="w-16 text-center border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700"
              />
            </div>
          )}

          {/* Notes lock toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Lock Notes</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Prevent adding, editing, deleting, or moving notes. Likes and votes still work.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={localNotesLocked}
              onClick={() => setLocalNotesLocked(!localNotesLocked)}
              disabled={localBoardLocked}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none
                ${localNotesLocked || localBoardLocked ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"}
                ${localBoardLocked ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform
                  ${localNotesLocked || localBoardLocked ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          {/* Full board lock toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Lock Board</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Permanently freeze the board. All modifications are disabled for everyone.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={localBoardLocked}
              onClick={() => setLocalBoardLocked(!localBoardLocked)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none
                ${localBoardLocked ? "bg-red-600" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform
                  ${localBoardLocked ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          {/* Clear warning */}
          {showClearWarning && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600 p-3 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium mb-1">Enabling voting will clear all existing likes.</p>
              <p>This cannot be undone. Do you want to continue?</p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleConfirmClear}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm hover:bg-amber-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? "Clearing…" : "Yes, clear likes"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelClear}
                  className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  Abort
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!showClearWarning && (
          <div className="flex justify-end gap-2 mt-8">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Abort
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

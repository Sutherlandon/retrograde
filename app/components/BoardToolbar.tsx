import { useState, useEffect, useRef } from "react";
import ExportButton from "./ExportButton";
import { useBoard } from "~/context/BoardContext";
import TimerDisplay from "./TimerDisplay";

export default function BoardToolbar({ title }: { title: string }) {
  const { updateTitle, isOwner, votingEnabled, votingAllowed, columns, boardLocked } = useBoard();
  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocalTitle(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = () => {
    const trimmed = localTitle.trim() || "Untitled";
    setLocalTitle(trimmed);
    updateTitle(trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      setLocalTitle(title);
      setEditing(false);
    }
  };

  const canEdit = isOwner && !boardLocked;

  const votesUsed = votingEnabled
    ? columns.flatMap((c) => c.notes).filter((n) => n.user_voted).length
    : 0;
  const votesRemaining = votingAllowed - votesUsed;

  return (
    <div className="flex items-center py-4 gap-2 sm:gap-4">
      <div className="min-w-0 flex-shrink">
        {editing ? (
          <input
            ref={inputRef}
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={save}
            onKeyDown={handleKeyDown}
            className="text-xl sm:text-2xl md:text-4xl font-bold border rounded w-full p-2"
          />
        ) : (
          <h1
            onClick={() => { if (canEdit) setEditing(true); }}
            className={`text-xl sm:text-2xl md:text-4xl font-bold truncate p-2 border border-transparent rounded-md ${canEdit ? "cursor-text hover:bg-slate-200 dark:hover:bg-slate-950" : ""}`}
            title={!canEdit ? (boardLocked ? "Board is locked" : "Only the owner can edit the title") : "Click to edit title"}
          >
            {localTitle}
          </h1>
        )}
      </div>
      <div className="flex-grow text-center">
        <TimerDisplay />
      </div>
      {votingEnabled && (
        <div className="text-sm font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
          {votesRemaining} vote{votesRemaining !== 1 ? "s" : ""} remaining
        </div>
      )}
      <ExportButton />
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import TimerButton from "./TimerButton";
import ExportButton from "./ExportButton";
import Button from "./Button";
import { useBoard } from "~/context/BoardContext";
import { EditIcon, PlusIcon, SettingsIcon } from "~/images/icons";
import TimerDisplay from "./TimerDisplay";
import { BoardSettingsModal } from "./BoardSettingsModal";

export default function BoardToolbar({ title }: { title: string }) {
  const { addColumn, updateTitle, isOwner, votingEnabled, votingAllowed, columns, notesLocked, boardLocked } = useBoard();
  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local state in sync if server pushes a new title (multi-user)
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
      setLocalTitle(title); // revert
      setEditing(false);
    }
  };

  // Compute how many votes the current user has cast (user_voted notes count)
  const votesUsed = votingEnabled
    ? columns.flatMap((c) => c.notes).filter((n) => n.user_voted).length
    : 0;
  const votesRemaining = votingAllowed - votesUsed;

  return (
    <>
      <div className="flex justify-between items-center py-4 gap-4">
        {editing ? (
          <input
            ref={inputRef}
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={save}
            onKeyDown={handleKeyDown}
            className="text-4xl font-bold border rounded w-full p-2 my-4"
          />
        ) : (
          <h1
            onClick={() => { if (!boardLocked) setEditing(true); }}
            className={`inline-flex gap-2 items-baseline p-2 my-4 border border-transparent rounded-md ${boardLocked ? "" : "cursor-text hover:bg-slate-200 dark:hover:bg-slate-950"}`}
            title={boardLocked ? "Board is locked" : "Click to edit title"}
          >
            {localTitle}
          </h1>
        )}
        <div className="flex-grow text-center">
          <TimerDisplay />
        </div>
        {votingEnabled && (
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {votesRemaining} vote{votesRemaining !== 1 ? "s" : ""} remaining
          </div>
        )}
        <TimerButton />
        <ExportButton />
        {!notesLocked && !boardLocked && (
          <Button
            icon={<PlusIcon />}
            text="Column"
            onClick={() => addColumn()}
          />
        )}
        {isOwner && (
          <Button
            icon={<SettingsIcon />}
            onClick={() => setShowSettings(true)}
            variant="text"
            title="Board settings"
          />
        )}
      </div>
      {showSettings && (
        <BoardSettingsModal onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}

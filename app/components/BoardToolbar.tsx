import { useState, useEffect, useRef } from "react";
import TimerButton from "./TimerButton";
import Button from "./Button";
import { useBoard } from "~/context/BoardContext";
import { EditIcon, PlusIcon } from "~/images/icons";
import TimerDisplay from "./TimerDisplay";

export default function BoardToolbar({ title }: { title: string }) {
  const { addColumn, updateTitle } = useBoard();
  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
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

  return (
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
          onClick={() => setEditing(true)}
          className={"inline-flex gap-2 items-baseline cursor-text hover:bg-slate-200 dark:hover:bg-slate-950 p-2 my-4 border border-transparent rounded-md"}
          title="Click to edit title"
        >
          {localTitle} <EditIcon size='xs' />
        </h1>
      )}
      <div className="flex-grow text-center">
        <TimerDisplay />
      </div>
      <TimerButton />
      <Button
        icon={<PlusIcon />}
        text="Column"
        onClick={() => addColumn()}
      />
    </div>
  );
}
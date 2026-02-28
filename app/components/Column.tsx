import React, { useState, useEffect } from "react";
import { useBoard } from "../context/BoardContext";
import type { Column } from "~/server/board.types";
import Note from "./Note";
import Button from "./Button";
import { PlusIcon, TrashIcon } from "~/images/icons";

export default function Column({ column, noteColor }: { column: Column, noteColor: string }) {
  const { updateColumnTitle, deleteColumn, addNote, moveNote } = useBoard();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [isDragOver, setIsDragOver] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [warningMode, setWarningMode] = useState(false);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(column.title);
  }, [column.title]);

  // Focus and select the title input when entering editing mode
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const saveTitle = () => {
    updateColumnTitle(column.id, title.trim() || "Untitled");
    setEditingTitle(false);
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const { noteId, fromcolumnId } = JSON.parse(
        e.dataTransfer.getData("application/json")
      );
      moveNote(fromcolumnId, column.id, noteId);
    } catch {
      // ignore invalid drops
    }
  };

  const handleDelete = () => {
    if (column.notes.length === 0) {
      setDeleteMode(true);
    } else {
      setWarningMode(true);
    }
  };

  return (
    <div
      className={`${isDragOver ? "bg-slate-200 dark:bg-slate-600" : "dark:bg-slate-800"
        } ${deleteMode ? "border-2 border-red-500" : "border-slate-400 dark:border-slate-700"
        } min-w-[350px] w-full md:max-w-1/2 min-h-[150px] rounded-md p-3 flex-1 transition-colors border-1 shadow-md/20`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {warningMode ? (
        <div className={`flex flex-col items-center justify-center h-full`}>
          <p className="mb-4">This column still contains notes. You should move or delete them before deleting the column.</p>
          <div className="flex gap-2">
            <Button
              onClick={() => setWarningMode(false)}
              text="Keep the Column"
            />
            <Button
              color="danger"
              variant="outline"
              onClick={() => {
                setWarningMode(false);
                setDeleteMode(true);
              }}
              text="Override!"
            />
          </div>
        </div>
      ) : deleteMode ? (
        <div className={`flex flex-col items-center justify-center h-full`}>
          <p className="mb-4">Are you sure you want to delete this column?</p>
          <div className="flex gap-2">
            <Button
              color="danger"
              onClick={() => { deleteColumn(column.id); setDeleteMode(false); }}
              text="Nuke the Column!"
            />
            <Button
              color="secondary"
              onClick={() => setDeleteMode(false)}
              text="Abort!"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-3">
            {editingTitle ? (
              <input
                type="text"
                ref={titleInputRef}
                className="font-bold px-2 py-1 border rounded"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => e.key === "Enter" && saveTitle()}
                autoFocus
              />
            ) : (
              <span
                className="font-bold cursor-text hover:bg-slate-200 dark:hover:bg-slate-950 p-1 rounded"
                onClick={() => setEditingTitle(true)}
              >
                {column.title}
              </span>
            )}
            <div className="flex-1"></div>
            <Button
              icon={<PlusIcon />}
              onClick={() => addNote(column.id)}
              className="hover:bg-green-300 dark:hover:bg-slate-900 dark:hover:text-green-500"
              variant="text"
              size="sm"
            />
            <Button
              icon={<TrashIcon />}
              onClick={() => handleDelete()}
              className="ml-1 hover:bg-red-300 dark:hover:bg-slate-900 dark:hover:text-red-500"
              variant="text"
              size="sm"
            />
          </div>
          <div className='flex gap-2 flex-wrap'>
            {column.notes.map((note) => (
              <Note key={note.id} note={note} columnId={column.id} noteColor={noteColor} />
            ))}
          </div>
        </>
      )}
    </div >
  );
}

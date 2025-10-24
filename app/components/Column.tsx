import React, { useState, useEffect } from "react";
import { useBoard } from "./BoardContext";
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

  // Automatically enter title editing mode when a column is created
  useEffect(() => {
    setEditingTitle(true);
  }, []);

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

  return (
    <div
      className={`rounded-md p-3 flex-1 transition-colors text-gray-100 border-1 ${isDragOver ? "bg-slate-600" : "bg-slate-800"} ${deleteMode ? "border-red-600" : "border-slate-800"}`}
      style={{ minWidth: "350px", maxWidth: "50%", minHeight: "150px" }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {deleteMode ? (
        <div className={`flex flex-col items-center justify-center h-full`}>
          <p className="mb-4">Are you sure you want to delete this column and all of the notes it contains?</p>
          <div className="flex gap-2">
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => { deleteColumn(column.id); setDeleteMode(false); }}
              text="Yes"
            />
            <Button
              className="bg-gray-600 hover:bg-gray-700 text-white"
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
                className="flex-1 font-bold px-2 py-1 border rounded"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => e.key === "Enter" && saveTitle()}
                autoFocus
              />
            ) : (
              <span
                className="font-bold cursor-pointer flex-1"
                onClick={() => setEditingTitle(true)}
              >
                {column.title}
              </span>
            )}
            <Button
              icon={<PlusIcon />}
              // text="Note"
              onClick={() => addNote(column.id)}
              className="text-white hover:text-green-500"
              variant="text"
            />
            <Button
              icon={<TrashIcon />}
              onClick={() => setDeleteMode(true)}
              className="ml-2 text-white hover:text-red-500"
              variant="text"
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

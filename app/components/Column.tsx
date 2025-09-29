import React, { useState } from "react";
import { useBoard } from "./BoardContext";
import type { Column } from "~/server/boardStore";
import Note from "./Note";
import Button from "./Button";

export default function Column({ column, noteColor }: { column: Column, noteColor: string }) {
  const { updateColumnTitle, deleteColumn, addNote, moveNote } = useBoard();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [isDragOver, setIsDragOver] = useState(false);

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
      className={`rounded-md p-3 flex-1 transition-colors text-gray-100 ${isDragOver ? "bg-slate-600" : "bg-slate-800"}`}
      style={{ minWidth: "350px", maxWidth: "50%", minHeight: "150px" }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex justify-between items-center mb-3">
        {editingTitle ? (
          <input
            type="text"
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
          onClick={() => addNote(column.id)}
        >
          + Note
        </Button>
        <Button
          onClick={() => deleteColumn(column.id)}
          className="ml-2 bg-red-500 hover:bg-red-800"
        >
          ✕
        </Button>
      </div>

      <div className='flex gap-2 flex-wrap'>
        {column.notes.map((note) => (
          <Note key={note.id} note={note} columnId={column.id} bgClass={noteColor} />
        ))}
      </div>
    </div >
  );
}

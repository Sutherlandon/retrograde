import React, { useState } from "react";
import { useBoard } from "./BoardContext";
import type { Column } from "~/server/boardStore";
import Note from "./Note";

export default function Column({ column }: { column: Column }) {
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
      const { noteId, fromColId } = JSON.parse(
        e.dataTransfer.getData("application/json")
      );
      moveNote(fromColId, column.id, noteId);
    } catch {
      // ignore invalid drops
    }
  };

  return (
    <div
      className={`rounded-md p-3 flex-1 transition-colors ${isDragOver ? "bg-blue-100" : "bg-gray-100"}`}
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
        <button
          onClick={() => addNote(column.id)}
          className="ml-2 text-sm bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 cursor-pointer whitespace-nowrap"
        >
          + Note
        </button>
        <button
          onClick={() => deleteColumn(column.id)}
          className="ml-2 text-sm bg-red-500 text-white px-2 py-1 rounded hover:bg-red-800 cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className='flex gap-2 flex-wrap'>
        {column.notes.map((note) => (
          <Note key={note.id} note={note} columnId={column.id} />
        ))}
      </div>
    </div >
  );
}

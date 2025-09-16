import React, { useEffect, useState } from "react";
import { useBoard } from "./BoardContext";
import type { Note } from "~/server/boardStore";

export default function Note({ note, columnId }: { note: Note; columnId: string }) {
  const { updateNote, deleteNote } = useBoard();
  const [isEditing, setIsEditing] = useState(note.new);
  const [text, setText] = useState(note.text);

  const handleLike = () => {
    updateNote(columnId, note.id, text, note.likes + 1);
  }

  const saveNote = () => {
    if (text.trim()) {
      updateNote(columnId, note.id, text.trim(), note.likes);
    } else {
      deleteNote(columnId, note.id);
    }
    setIsEditing(false);
  };

  return (
    <div
      className="bg-yellow-100 rounded-md p-2 mb-2 shadow-sm cursor-grab text-xs"
      style={{ width: '47%', maxWidth: '15em' }}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({ noteId: note.id, fromcolumnId: columnId })
        );
      }}
    >
      {isEditing ? (
        <textarea
          className="w-full resize-none p-2 rounded border border-gray-300"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && saveNote()}
          autoFocus
        />
      ) : (
        <div>
          <div className="flex gap-2 mb-2">
            <div className="flex-1 whitespace-pre-wrap">
              {note.text}
            </div>
            <div className="flex flex-col items-start">
              <button
                onClick={() => deleteNote(columnId, note.id, note.text)}
                className="ml-2 text-red-600 font-bold hover:bg-gray-300 px-1 rounded-sm"
              >
                ✕
              </button>
            </div>
          </div>
          <div className='flex justify-between items-center'>
            <button
              onClick={() => handleLike()}
              className="font-bold cursor-pointer hover:bg-gray-300 px-1 rounded-sm"
            >
              {note.likes} 👍
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="font-bold cursor-pointer hover:bg-gray-300 px-1 rounded-sm"
            >
              ✎
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
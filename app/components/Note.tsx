import React, { useEffect, useState } from "react";
import { useBoard } from "./BoardContext";
import type { Note } from "~/server/board.types";
import { EditIcon, ThumbsUpIcon, TrashIcon } from "~/images/icons";
import Button from "./Button";

export default function Note({
  note,
  columnId,
  bgClass
}: {
  note: Note;
  columnId: string,
  bgClass: string
}) {
  const { updateNote, deleteNote } = useBoard();
  const [isEditing, setIsEditing] = useState(note.is_new);
  const [text, setText] = useState(note.text);

  const handleLike = () => {
    updateNote(columnId, note.id, text, note.likes + 1, note.created);
  }

  const saveNote = () => {
    if (text.trim()) {
      updateNote(columnId, note.id, text.trim(), note.likes, note.created);
    } else {
      deleteNote(columnId, note.id);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`${bgClass} text-slate-900 rounded-md p-2 mb-2 shadow-sm cursor-grab text-xs w-[47%] max-w-[15em]`}
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
          className="w-full resize-none p-2 rounded border border-gray-300 min-h-[90px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && saveNote()}
          autoFocus
        />
      ) : (
        <div className="flex flex-col gap-2 justify-between h-full" onDoubleClick={() => setIsEditing(true)}>
          <div className="flex gap-2">
            <div className="flex-1 whitespace-pre-wrap">
              {note.text}
            </div>
            <div className="flex flex-col items-start">
              <Button
                icon={<TrashIcon size="sm" />}
                onClick={() => deleteNote(columnId, note.id, note.text)}
                variant="text"
              />
            </div>
          </div>
          <div className='flex justify-between items-center'>
            <Button
              text={note.likes.toString()}
              icon={<ThumbsUpIcon size="sm" />}
              onClick={() => handleLike()}
              onDoubleClick={(e: Event) => e.stopPropagation()}
              variant="text"
            />
            <Button
              icon={<EditIcon size="sm" />}
              onClick={() => setIsEditing(true)}
              variant="text"
            />
          </div>
        </div>
      )}
    </div>
  );
}
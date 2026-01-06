import { useEffect, useMemo, useState } from "react";
import debounce from "lodash.debounce";
import { useBoard } from "./BoardContext";
import type { Note } from "~/server/board.types";
import { EditIcon, ThumbsUpIcon, TrashIcon } from "~/images/icons";
import Button from "./Button";

export default function Note({
  note,
  columnId,
  noteColor
}: {
  note: Note;
  columnId: string,
  noteColor: string
}) {
  const { updateNote, deleteNote } = useBoard();
  const [isEditing, setIsEditing] = useState(note.is_new);
  const [text, setText] = useState(note.text);
  const [likes, setLikes] = useState(note.likes);
  const [deleteMode, setDeleteMode] = useState(false);

  // sync local state when note prop changes
  useEffect(() => {
    setText(note.text);
    setLikes(note.likes);
  }, [note.text, note.likes]);

  // repeated like clicks within 300ms will only trigger one update
  const submitLikes = useMemo(
    () => debounce((newLikes: number) => {
      updateNote(columnId, note.id, text, newLikes, note.created);
    }, 1000),
    [updateNote, columnId, note.id, text, note.created]
  );

  // cleanup likes debounce on unmount
  useEffect(() => {
    return () => {
      submitLikes.cancel();
    };
  }, [submitLikes]);

  // handle like button click
  const handleLike = () => {
    setLikes(likes + 1);
    submitLikes(likes + 1);
  };

  // save note (on blur or enter)
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
      className={`${noteColor} text-slate-900 rounded-md p-2 mb-2 shadow-md/20 cursor-grab text-xs w-[47%] max-w-[15rem] min-h-[6rem]`}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({ noteId: note.id, fromcolumnId: columnId })
        );
      }}
    >
      {deleteMode ? (
        <div className={`flex flex-col items-center justify-center h-full`}>
          <p className="mb-4">Are you sure you want to delete this note?</p>
          <div className="flex gap-2">
            <Button
              color="danger"
              onClick={() => { deleteNote(columnId, note.id, note.text); setDeleteMode(false); }}
              text="Delete"
            />
            <Button
              color="muted"
              onClick={() => setDeleteMode(false)}
              text="Abort!"
            />
          </div>
        </div>
      ) :
        isEditing ? (
          <textarea
            className="w-full resize-none p-2 rounded border border-gray-300 min-h-[90px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && saveNote()}
            autoFocus
          />
        ) : (
          <div
            className="flex flex-col gap-2 justify-between h-full"
            onDoubleClick={() => setIsEditing(true)}
          >
            <div className="flex-1 whitespace-pre-wrap">
              {note.text}
            </div>
            <div className='flex justify-start items-center'>
              <Button
                text={likes.toString()}
                icon={<ThumbsUpIcon size="sm" />}
                onClick={handleLike}
                onDoubleClick={(e: Event) => e.stopPropagation()}
                variant="text"
                className="px-1"
              />
              <div className='grow' />
              <Button
                icon={<EditIcon size="sm" />}
                onClick={() => setIsEditing(true)}
                variant="text"
              />
              <Button
                icon={<TrashIcon size="sm" />}
                onClick={() => setDeleteMode(true)}
                variant="text"
              />
            </div>
          </div>
        )}
    </div>
  );
}
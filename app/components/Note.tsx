import { useEffect, useMemo, useState, useRef } from "react";
import debounce from "lodash.debounce";
import { useBoard } from "../context/BoardContext";
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
  const { updateNote, deleteNote, likeNote } = useBoard();
  const [isEditing, setIsEditing] = useState(note.is_new);
  const [text, setText] = useState(note.text);
  const [likes, setLikes] = useState(note.likes);
  const [deleteMode, setDeleteMode] = useState(false);

  const pendingLikes = useRef(0);

  // sync local state when note prop changes
  useEffect(() => {
    setText(note.text);
    setLikes(note.likes);
  }, [note.text, note.likes]);

  const flushLikes = useMemo(
    () => debounce(async () => {
      const delta = pendingLikes.current;
      pendingLikes.current = 0;
      try {
        await likeNote(note.id, delta);
      } catch {
        setLikes(prev => prev - delta); // rollback
      }
    }, 1000),
    [columnId, note.id]
  );

  const handleLike = () => {
    pendingLikes.current += 1;
    setLikes(prev => prev + 1);
    flushLikes();
  };

  // cleanup likes debounce on unmount
  // useEffect(() => {
  //   return () => {
  //     submitLikes.cancel();
  //   };
  // }, [submitLikes]);

  // handle like button click
  // const handleLike = () => {
  //   setLikes(likes + 1);
  //   submitLikes(likes + 1);
  // };

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
        <div
          className="flex flex-col gap-2 justify-between h-full"
          onDoubleClick={() => setIsEditing(true)}
        >
          <div className="flex-1 whitespace-pre-wrap">
            {note.text}
          </div>
          {deleteMode ? (
            <div className="flex gap-2 w-full">
              <Button
                color="danger"
                onClick={() => { deleteNote(columnId, note.id, note.text); setDeleteMode(false); }}
                text="Delete"
                size="sm"
                className="w-full"
              />
              <Button
                color="secondary"
                onClick={() => setDeleteMode(false)}
                text="Keep"
                size="sm"
                className="w-full"
              />
            </div>
          ) : (
            <div className='flex justify-start items-center'>
              <Button
                text={likes.toString()}
                icon={<ThumbsUpIcon size="sm" />}
                onClick={handleLike}
                onDoubleClick={(e: Event) => e.stopPropagation()}
                variant="text"
                size='sm'
                className="dark:hover:bg-[rgba(0,0,0,0.1)]"
              />
              <div className='grow' />
              <Button
                icon={<EditIcon size="sm" />}
                onClick={() => setIsEditing(true)}
                variant="text"
                size='sm'
                className="dark:hover:bg-[rgba(0,0,0,0.1)]"
              />
              <Button
                icon={<TrashIcon size="sm" />}
                onClick={() => setDeleteMode(true)}
                variant="text"
                size='sm'
                className="dark:hover:bg-[rgba(0,0,0,0.1)]"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
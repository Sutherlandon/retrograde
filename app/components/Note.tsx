import { useEffect, useMemo, useState, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import debounce from "lodash.debounce";
import { useBoard } from "../context/BoardContext";
import { useOptionalUser } from "~/context/userContext";
import type { Note } from "~/server/board.types";
import { EditIcon, ThumbsUpIcon, ThumbsUpFilledIcon, TrashIcon } from "~/images/icons";
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
  const { updateNote, deleteNote, likeNote, voteNote, votingEnabled, votingAllowed, columns, notesLocked, boardLocked } = useBoard();
  const user = useOptionalUser();
  const [isEditing, setIsEditing] = useState(note.is_new);
  const [text, setText] = useState(note.text);
  const [likes, setLikes] = useState(note.likes);
  const [deleteMode, setDeleteMode] = useState(false);

  const pendingLikes = useRef(0);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: note.id,
    disabled: isEditing || notesLocked || boardLocked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };

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
    [columnId, note.id, likeNote]
  );

  const handleLike = () => {
    pendingLikes.current += 1;
    setLikes(prev => prev + 1);
    flushLikes();
  };

  // Count votes the user has already cast across the board
  const votesUsed = columns.flatMap((c) => c.notes).filter((n) => n.user_voted).length;
  const votesRemaining = votingAllowed - votesUsed;
  const userVoted = note.user_voted ?? false;

  // Vote is allowed if: user is logged in, they haven't maxed out votes, OR they're un-voting
  const canVote = !!user && (userVoted || votesRemaining > 0);

  const handleVote = () => {
    if (!canVote) return;
    voteNote(note.id);
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

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-md border-2 border-dashed border-slate-400 dark:border-slate-500 w-[47%] max-w-[15rem] min-h-[6rem] mb-2"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`${noteColor} text-slate-900 rounded-md p-2 mb-2 shadow-md/20 text-xs w-[47%] max-w-[15rem] min-h-[6rem] ${notesLocked || boardLocked ? "cursor-default" : "cursor-grab touch-none"}`}
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
          onDoubleClick={() => { if (!notesLocked && !boardLocked) setIsEditing(true); }}
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
              {boardLocked ? (
                <span className="flex items-center gap-1 px-2 py-1 text-xs text-slate-900">
                  {votingEnabled
                    ? <><ThumbsUpIcon size="sm" /> {note.votes ?? 0}</>
                    : <><ThumbsUpIcon size="sm" /> {likes}</>
                  }
                </span>
              ) : votingEnabled ? (
                <Button
                  text={(note.votes ?? 0).toString()}
                  icon={userVoted
                    ? <ThumbsUpFilledIcon size="sm" className="text-blue-600" />
                    : <ThumbsUpIcon size="sm" />
                  }
                  onClick={handleVote}
                  onDoubleClick={(e: Event) => e.stopPropagation()}
                  variant="text"
                  size='sm'
                  className={`dark:hover:bg-[rgba(0,0,0,0.1)] ${!canVote ? "opacity-40 cursor-not-allowed" : ""}`}
                  title={
                    !user
                      ? "Log in to vote"
                      : !canVote
                      ? "No votes remaining"
                      : userVoted
                      ? "Remove vote"
                      : "Cast vote"
                  }
                />
              ) : (
                <Button
                  text={likes.toString()}
                  icon={<ThumbsUpIcon size="sm" />}
                  onClick={handleLike}
                  onDoubleClick={(e: Event) => e.stopPropagation()}
                  variant="text"
                  size='sm'
                  className="dark:hover:bg-[rgba(0,0,0,0.1)]"
                />
              )}
              <div className='grow' />
              {!notesLocked && !boardLocked && (
                <>
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
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

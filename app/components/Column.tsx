import React, { useState, useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useBoard } from "../context/BoardContext";
import type { Column } from "~/server/board.types";
import Note from "./Note";
import Button from "./Button";
import { PlusIcon, EllipsisIcon, TrashIcon, EditIcon } from "~/images/icons";

export default function Column({ column, noteColor }: { column: Column, noteColor: string }) {
  const { updateColumnTitle, updateColumnPrompt, deleteColumn, addNote, notesLocked, boardLocked } = useBoard();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [deleteMode, setDeleteMode] = useState(false);
  const [warningMode, setWarningMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [prompt, setPrompt] = useState(column.prompt ?? "");
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const noteIds = column.notes.map((n) => n.id);

  useEffect(() => {
    setTitle(column.title);
  }, [column.title]);

  useEffect(() => {
    setPrompt(column.prompt ?? "");
  }, [column.prompt]);

  // Focus and select the title input when entering editing mode
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  // Focus prompt textarea when entering editing mode
  useEffect(() => {
    if (editingPrompt && promptRef.current) {
      promptRef.current.focus();
    }
  }, [editingPrompt]);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const saveTitle = () => {
    updateColumnTitle(column.id, title.trim() || "Untitled");
    setEditingTitle(false);
  };

  const savePrompt = () => {
    updateColumnPrompt(column.id, prompt);
    setEditingPrompt(false);
  };

  const handleDelete = () => {
    setMenuOpen(false);
    if (column.notes.length === 0) {
      setDeleteMode(true);
    } else {
      setWarningMode(true);
    }
  };

  const handleAddPrompt = () => {
    setMenuOpen(false);
    setEditingPrompt(true);
  };

  return (
    <div
      ref={setNodeRef}
      className={`${isOver ? "bg-slate-200 dark:bg-slate-600" : "dark:bg-slate-800"
        } ${deleteMode ? "border-2 border-red-500" : "border-slate-400 dark:border-slate-700"
        } min-w-[350px] w-full md:max-w-1/2 min-h-[150px] rounded-md p-3 flex-1 transition-colors border-1 shadow-md/20`}
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
                className={`font-bold p-1 rounded ${notesLocked || boardLocked ? "" : "cursor-text hover:bg-slate-200 dark:hover:bg-slate-950"}`}
                onClick={() => { if (!notesLocked && !boardLocked) setEditingTitle(true); }}
              >
                {column.title}
              </span>
            )}
            <div className="flex-1"></div>
            {!notesLocked && !boardLocked && (
              <Button
                icon={<PlusIcon />}
                onClick={() => addNote(column.id)}
                className="hover:bg-green-300 dark:hover:bg-slate-900 dark:hover:text-green-500"
                variant="text"
                size="sm"
              />
            )}
            {!notesLocked && !boardLocked && (
            <div className="relative ml-1" ref={menuRef}>
              <Button
                icon={<EllipsisIcon />}
                onClick={() => setMenuOpen((o) => !o)}
                className="hover:bg-gray-300 dark:hover:bg-slate-900"
                variant="text"
                size="sm"
              />
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-52 rounded-md border bg-white dark:bg-gray-800 border-blue-500 shadow-lg z-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={handleAddPrompt}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <span className="text-gray-500 dark:text-gray-400"><EditIcon size="sm" /></span>
                    {column.prompt ? "Edit Prompt Text" : "Add Prompt Text"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <span><TrashIcon size="sm" /></span>
                    Delete Column
                  </button>
                </div>
              )}
            </div>
            )}
          </div>

          {editingPrompt ? (
            <div className="mb-3">
              <textarea
                ref={promptRef}
                className="w-full px-2 py-1 border rounded text-sm resize-none"
                rows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter additional prompt text..."
              />
              <div className="flex gap-2">
                <Button
                  onClick={savePrompt}
                  color="primary"
                  className="mt-1"
                  size="sm"
                  text="Save Prompt"
                />
                <Button
                  onClick={() => setEditingPrompt(false)}
                  color="muted"
                  variant="outline"
                  className="mt-1 mr-2"
                  size="sm"
                  text="Abort"
                />
              </div>
            </div>
          ) : column.prompt ? (
            <div className="mb-6 p-2 border-b border-t border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-400 cursor-text whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
              {column.prompt}
            </div>
          ) : null}

          <SortableContext items={noteIds} strategy={rectSortingStrategy}>
            <div className='flex gap-2 flex-wrap'>
              {column.notes.map((note) => (
                <Note key={note.id} note={note} columnId={column.id} noteColor={noteColor} />
              ))}
            </div>
          </SortableContext>
        </>
      )}
    </div >
  );
}

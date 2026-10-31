// app/components/ActionItemsPanel.tsx
// "Action Items" — board-level follow-ups (issue #88), rendered as a dedicated
// column on the right side of the board (replaces the old default "Action items"
// note column). Facilitators create/edit/delete; every participant can check
// items off. Facilitators can hide the whole column from the Command Deck.

import { useState, useLayoutEffect, useRef } from "react";
import { useBoard } from "~/context/BoardContext";
import { TrashIcon, PlusIcon, EditIcon } from "~/images/icons";
import { StatusLED } from "./StatusLED";
import Button from "./Button";
import type { ActionItem } from "~/server/board.types";
import { BOARD_LIMITS } from "~/config/board_limits";

// One-line-tall textarea that grows to fit its content. Enter submits (handled
// by callers); Shift+Enter inserts a newline like a normal textarea.
function AutoGrowTextarea({
  value,
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={BOARD_LIMITS.actionItemText}
      className={`resize-none overflow-hidden ${className}`}
      {...rest}
    />
  );
}

// Tab starts another item. Shift+Tab leaves for the next column: this is the
// board's last, so it wraps to the first. Hotkeys are listed in config/hotkeys.ts;
// keep the two in step.
function useMoveOn() {
  const { columns, addNote, setAddingActionItem } = useBoard();

  return (e: React.KeyboardEvent) => {
    if (!e.shiftKey) {
      setAddingActionItem(true);
      return;
    }
    setAddingActionItem(false);
    if (columns[0]) addNote(columns[0].id);
  };
}

function ObjectiveRow({ item }: { item: ActionItem }) {
  const { toggleActionItem, updateActionItem, deleteActionItem, canFacilitate, boardLocked } = useBoard();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const moveOn = useMoveOn();

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) deleteActionItem(item.id);
    else if (trimmed !== item.text) updateActionItem(item.id, trimmed);
    setEditing(false);
  };

  return (
    <li className="flex items-start gap-3 group py-1" data-testid="objective-row">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.completed}
        disabled={boardLocked || item.is_new}
        onClick={() => toggleActionItem(item.id, !item.completed)}
        className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors
          ${boardLocked ? "cursor-default opacity-60" : "cursor-pointer"}
          ${item.completed
            ? "bg-green-500 border-green-500 text-white"
            : "border-gray-300 dark:border-gray-600 hover:border-green-400"}`}
      >
        {item.completed && <span className="text-[10px] leading-none">✓</span>}
      </button>

      {editing ? (
        <AutoGrowTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === "Escape") { setText(item.text); setEditing(false); }
            if (e.key === "Tab") { e.preventDefault(); save(); moveOn(e); }
          }}
          autoFocus
          className="flex-1 border rounded px-2 py-0.5 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
        />
      ) : (
        <span
          onDoubleClick={() => { if (canFacilitate && !boardLocked && !item.is_new) setEditing(true); }}
          className={`flex-1 text-sm ${item.completed ? "line-through text-gray-400 dark:text-gray-600" : ""} ${canFacilitate && !boardLocked ? "cursor-text" : ""}`}
        >
          {item.text}
        </span>
      )}

      {/* Disabled rather than hidden while saving, so the text doesn't reflow when they arrive. */}
      {canFacilitate && !boardLocked && !editing && (
        <>
          <button
            type="button"
            disabled={item.is_new}
            onClick={() => setEditing(true)}
            title="Edit action item"
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-opacity cursor-pointer"
          >
            <EditIcon size="sm" />
          </button>
          <button
            type="button"
            disabled={item.is_new}
            onClick={() => deleteActionItem(item.id)}
            title="Delete action item"
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity cursor-pointer"
          >
            <TrashIcon size="sm" />
          </button>
        </>
      )}
    </li>
  );
}

// A blank row shown after clicking the header "+": an unchecked circle and a
// focused text field, mirroring the edit affordance. Enter saves and closes, Tab
// saves and clears for the next item, blur commits a pending draft, Escape cancels.
function DraftRow({ onAdd, onClose }: { onAdd: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const moveOn = useMoveOn();

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed) onAdd(trimmed);
    setText("");
  };

  return (
    <li className="flex items-start gap-3 py-1" data-testid="objective-draft-row">
      <span className="w-5 h-5 shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-600" />
      <AutoGrowTextarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { commit(); onClose(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); onClose(); }
          if (e.key === "Escape") { setText(""); onClose(); }
          if (e.key === "Tab") { e.preventDefault(); commit(); moveOn(e); }
        }}
        autoFocus
        placeholder="Add a follow-up item…"
        data-testid="objective-input"
        className="flex-1 min-w-0 border rounded px-2 py-0.5 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
      />
    </li>
  );
}

export function ActionItemsPanel() {
  const { actionItems, addActionItem, canFacilitate, actionItemsVisible, canAddActionItems, addingActionItem, setAddingActionItem } = useBoard();

  const total = actionItems.length;
  const done = actionItems.filter((i) => i.completed).length;
  const allDone = total > 0 && done === total;

  // Facilitators can hide the column entirely from the Command Deck.
  if (actionItemsVisible === false) return null;

  // Participants with no items to see get nothing at all.
  if (!canFacilitate && total === 0) return null;

  return (
    <section
      data-testid="action-items-panel"
      className="min-w-[350px] w-full md:max-w-1/2 flex-1 min-h-[150px] rounded-md p-3
        border border-green-500 dark:border-green-700/50 shadow-md/20
        dark:bg-slate-800"
    >
      <div className="flex items-center gap-3 mb-3">
        <StatusLED color={allDone ? "green" : "amber"} active={total > 0} size="sm" />
        <span className="font-bold">
          Action Items
        </span>
        {total > 0 && (
          <span
            data-testid="objective-count"
            className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums"
          >
            {done}/{total} complete
          </span>
        )}
        {canAddActionItems && (
          <Button
            icon={<PlusIcon />}
            onClick={() => setAddingActionItem(true)}
            aria-label="Add action item"
            title="Add action item"
            className={`${total > 0 ? "ml-1" : "ml-auto"} hover:bg-green-300 dark:hover:bg-slate-900 dark:hover:text-green-500`}
            variant="text"
            size="sm"
          />
        )}
      </div>

      {/* Progress track */}
      <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-3">
        <span
          data-testid="objective-progress"
          className="block h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
          style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }}
        />
      </div>

      {total === 0 && !addingActionItem ? (
        <p className="text-sm text-gray-400 dark:text-gray-600 mb-2">
          No action items yet. Capture the follow-ups your crew commits to.
        </p>
      ) : (
        <ul className="space-y-0.5 mb-2">
          {actionItems.map((item) => (
            <ObjectiveRow key={item.id} item={item} />
          ))}
          {addingActionItem && canAddActionItems && (
            <DraftRow onAdd={addActionItem} onClose={() => setAddingActionItem(false)} />
          )}
        </ul>
      )}
    </section>
  );
}

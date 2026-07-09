// app/components/ActionItemsPanel.tsx
// "Mission Objectives" — board-level action items (issue #88).
// Checkbox list with a completion progress track. Facilitators create/edit/
// delete; every participant can check items off.

import { useState } from "react";
import { useBoard } from "~/context/BoardContext";
import { TrashIcon, PlusIcon } from "~/images/icons";
import { StatusLED } from "./StatusLED";
import type { ActionItem } from "~/server/board.types";

function ObjectiveRow({ item }: { item: ActionItem }) {
  const { toggleActionItem, updateActionItem, deleteActionItem, canFacilitate, boardLocked } = useBoard();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);

  const save = () => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== item.text) updateActionItem(item.id, trimmed);
    setEditing(false);
  };

  return (
    <li className="flex items-center gap-3 group py-1" data-testid="objective-row">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.completed}
        disabled={boardLocked}
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
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setText(item.text); setEditing(false); }
          }}
          autoFocus
          className="flex-1 border rounded px-2 py-0.5 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
        />
      ) : (
        <span
          onDoubleClick={() => { if (canFacilitate && !boardLocked) setEditing(true); }}
          className={`flex-1 text-sm ${item.completed ? "line-through text-gray-400 dark:text-gray-600" : ""} ${canFacilitate && !boardLocked ? "cursor-text" : ""}`}
        >
          {item.text}
        </span>
      )}

      {canFacilitate && !boardLocked && (
        <button
          type="button"
          onClick={() => deleteActionItem(item.id)}
          title="Delete objective"
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity cursor-pointer"
        >
          <TrashIcon size="sm" />
        </button>
      )}
    </li>
  );
}

export function ActionItemsPanel() {
  const { actionItems, addActionItem, canFacilitate, boardLocked } = useBoard();
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState("");

  const total = actionItems.length;
  const done = actionItems.filter((i) => i.completed).length;
  const allDone = total > 0 && done === total;

  // Participants with no objectives to see get nothing at all.
  if (!canFacilitate && total === 0) return null;

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addActionItem(trimmed);
    setDraft("");
  };

  return (
    <section
      data-testid="action-items-panel"
      className="mb-4 rounded-2xl border border-gray-200 dark:border-gray-700/50
        bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 cursor-pointer"
        aria-expanded={expanded}
      >
        <StatusLED color={allDone ? "green" : "amber"} active={total > 0} size="sm" />
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500 dark:text-gray-400">
          Mission Objectives
        </span>
        {total > 0 && (
          <span
            data-testid="objective-count"
            className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums"
          >
            {done}/{total} complete
          </span>
        )}
        {/* Progress track */}
        <span className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden ml-2">
          <span
            data-testid="objective-progress"
            className="block h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
            style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }}
          />
        </span>
        <span className="text-gray-400 text-xs">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          {total === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-600 mb-2">
              No objectives yet. Capture the follow-ups your crew commits to.
            </p>
          ) : (
            <ul className="space-y-0.5 mb-2">
              {actionItems.map((item) => (
                <ObjectiveRow key={item.id} item={item} />
              ))}
            </ul>
          )}

          {canFacilitate && !boardLocked && (
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                placeholder="Add an objective…"
                data-testid="objective-input"
                className="flex-1 border rounded px-3 py-1.5 text-sm border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
              />
              <button
                type="button"
                onClick={add}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm cursor-pointer flex items-center gap-1"
              >
                <PlusIcon size="sm" /> Add
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

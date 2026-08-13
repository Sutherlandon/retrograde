// app/components/DashboardActionItems.tsx
// Dashboard rollup of every open action item the user can see — fully
// interactive, mirroring the board's Action Items column: any participant
// can check items off; managers (crew members for crew items, facilitators
// for board items) can edit on double-click and delete. Rows submit straight
// to the item's home route (board resource route or crew page action), so a
// change here is the same mutation the board makes — the dashboard loader
// revalidates after each one, and open boards pick it up via their polling.
//
// When an item drops out of the incoming `items` prop (because it was
// completed/deleted, here or anywhere else), it isn't removed from the DOM
// immediately — it's kept mounted and animated shut (height + opacity) so the
// remaining rows shift up smoothly instead of the list jumping.

import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { StatusLED } from "./StatusLED";
import { TrashIcon, EditIcon, PlusIcon } from "~/images/icons";
import type { UserActionItemRow } from "~/server/action_item_model";

// How long a checked item lingers (struck through, with a countdown bar) before
// the completion actually submits — giving the user a window to undo.
const UNDO_DELAY_MS = 3000;

// How long a departing row takes to collapse shut once it's gone from `items`.
const EXIT_DURATION_MS = 300;

function ItemRow({ item, scopedTeamId }: { item: UserActionItemRow; scopedTeamId?: string }) {
  const fetcher = useFetcher();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  const isBoardItem = item.board_id !== null;
  const home = isBoardItem
    ? `/app/board/${item.board_id}/action-items`
    : `/app/crews/${item.team_id}`;

  const inFlight = fetcher.state !== "idle";
  // Checked visual persists through the grace window and the submit that follows,
  // until the loader revalidates and drops the item from the open list.
  const checked = pending || inFlight;
  // Countdown bar shows only during the undo window (before we actually submit).
  const showCountdown = pending && !inFlight;

  // Clear any dangling timer if the row unmounts (e.g. loader dropped it).
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Cancel a pending delete confirmation if the user clicks anywhere else.
  useEffect(() => {
    if (!confirmingDelete) return;
    function handleClickOutside(e: MouseEvent) {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setConfirmingDelete(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [confirmingDelete]);

  const submitComplete = () => {
    if (isBoardItem) {
      fetcher.submit(
        { intent: "complete", itemId: item.id, completed: "true" },
        { method: "PATCH", action: home }
      );
    } else {
      fetcher.submit(
        { intent: "toggleItem", itemId: item.id, completed: "true" },
        { method: "post", action: home }
      );
    }
  };

  const toggle = () => {
    // Undo while still inside the grace window.
    if (pending) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setPending(false);
      return;
    }
    // Start the grace window; commit once it elapses.
    setPending(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      submitComplete();
    }, UNDO_DELAY_MS);
  };

  const save = () => {
    const trimmed = text.trim();
    setEditing(false);
    if (!trimmed || trimmed === item.text) return;
    if (isBoardItem) {
      fetcher.submit(
        { intent: "text", itemId: item.id, text: trimmed },
        { method: "PATCH", action: home }
      );
    } else {
      fetcher.submit(
        { intent: "updateItem", itemId: item.id, text: trimmed },
        { method: "post", action: home }
      );
    }
  };

  const confirmRemove = () => {
    setConfirmingDelete(false);
    if (isBoardItem) {
      fetcher.submit({ itemId: item.id }, { method: "DELETE", action: home });
    } else {
      fetcher.submit(
        { intent: "deleteItem", itemId: item.id },
        { method: "post", action: home }
      );
    }
  };

  return (
    <div className="relative flex items-start gap-3 py-2 text-sm group" data-testid="dashboard-item-row">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={inFlight}
        onClick={toggle}
        title={pending ? "Undo" : undefined}
        className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default
          ${checked
            ? "bg-green-500 border-green-500 text-white"
            : "border-gray-300 dark:border-gray-600 hover:border-green-400"}`}
      >
        {checked && <span className="text-[10px] leading-none">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
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
            className="w-full border rounded px-2 py-0.5 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
          />
        ) : (
          <span
            onDoubleClick={() => { if (item.can_manage) setEditing(true); }}
            className={`block break-words ${checked ? "line-through text-gray-400 dark:text-gray-600" : ""} ${item.can_manage ? "cursor-text" : ""}`}
          >
            {item.text}
          </span>
        )}

        <div className="flex items-center gap-1.5 mt-2">
          {/* Crew pill is redundant when the whole list is already one crew. */}
          {!scopedTeamId && (isBoardItem ? item.board_team_name : item.team_name) && (
            <a
              href={`/app/crews/${isBoardItem ? item.board_team_id : item.team_id}`}
              className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors"
            >
              {isBoardItem ? item.board_team_name : item.team_name}
            </a>
          )}
          {isBoardItem && (
            <a
              href={`/app/board/${item.board_id}`}
              className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {item.board_title}
            </a>
          )}
        </div>
      </div>

      {item.can_manage && (
        confirmingDelete ? (
          <div ref={confirmRef} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={confirmRemove}
              className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white cursor-pointer"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="text-xs font-medium px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          !editing && (
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="Edit action item"
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-opacity cursor-pointer"
              >
                <EditIcon size="sm" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                title="Delete action item"
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity cursor-pointer"
              >
                <TrashIcon size="sm" />
              </button>
            </div>
          )
        )
      )}

      {showCountdown && (
        <span
          aria-hidden="true"
          data-testid="undo-countdown"
          className="absolute left-0 bottom-0 h-1 rounded-full bg-green-500"
          style={{ animation: `ai-undo-countdown ${UNDO_DELAY_MS}ms linear forwards` }}
        />
      )}
    </div>
  );
}

// Wraps a row so it can animate shut (height + opacity) instead of vanishing
// the instant it drops out of the `items` prop. Uses the CSS-grid
// grid-template-rows trick to animate to an auto height of zero without
// measuring anything in JS.
function ExitableRow({ exiting, onExited, children }: {
  exiting: boolean;
  onExited: () => void;
  children: React.ReactNode;
}) {
  // Deliberately keyed only on `exiting` — `onExited` is a fresh closure each
  // render and re-arming the timer on every render would keep pushing it out.
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(onExited, EXIT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  return (
    <li
      className="grid"
      style={{
        gridTemplateRows: exiting ? "0fr" : "1fr",
        opacity: exiting ? 0 : 1,
        transition: `grid-template-rows ${EXIT_DURATION_MS}ms ease-in-out, opacity ${EXIT_DURATION_MS}ms ease-in-out`,
      }}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </li>
  );
}

// Draft row for adding a crew-level action item. Only rendered when the host
// (the crew page) provides `onAdd`.
function AddItemRow({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
  };
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-5 h-5 shrink-0 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="Add a crew action item…"
        data-testid="add-action-item-input"
        className="flex-1 min-w-0 border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
      />
      <button
        type="button"
        onClick={submit}
        title="Add action item"
        aria-label="Add action item"
        className="text-green-600 hover:text-green-700 dark:text-green-500 dark:hover:text-green-400 cursor-pointer shrink-0"
      >
        <PlusIcon size="sm" />
      </button>
    </li>
  );
}

interface RenderState {
  list: UserActionItemRow[];
  exiting: Set<string>;
}

export function DashboardActionItems({
  items,
  defaultExpanded = false,
  onAddItem,
  scopedTeamId,
}: {
  items: UserActionItemRow[];
  /** Crew page shows it open; dashboard leaves it collapsed. */
  defaultExpanded?: boolean;
  /** When set (crew page), an add-item row appears and the section stays
   *  visible even with zero open items. */
  onAddItem?: (text: string) => void;
  /** When set, hide the redundant crew pill (the list is already one crew). */
  scopedTeamId?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Locally-rendered list, which lags behind `items` just long enough to
  // animate departing rows shut rather than dropping them instantly.
  const [state, setState] = useState<RenderState>(() => ({ list: items, exiting: new Set() }));

  useEffect(() => {
    setState((prev) => {
      const incoming = new Map(items.map((i) => [i.id, i]));
      const prevIds = new Set(prev.list.map((p) => p.id));
      const exiting = new Set(prev.exiting);

      for (const p of prev.list) {
        if (!incoming.has(p.id)) exiting.add(p.id);
      }

      // Preserve each row's position; refresh data for rows still present.
      const list = prev.list.map((p) => incoming.get(p.id) ?? p);
      // Append genuinely new rows in incoming order.
      for (const i of items) {
        if (!prevIds.has(i.id)) list.push(i);
      }

      return { list, exiting };
    });
  }, [items]);

  const handleExited = (id: string) => {
    setState((prev) => {
      if (!prev.exiting.has(id)) return prev;
      const exiting = new Set(prev.exiting);
      exiting.delete(id);
      return { list: prev.list.filter((i) => i.id !== id), exiting };
    });
  };

  // Nothing to show or add — the header is a static "all clear" state rather
  // than a toggle (there's no content to expand into).
  const expandable = state.list.length > 0 || !!onAddItem;
  const HeaderTag = expandable ? "button" : "div";

  return (
    <section
      data-testid="dashboard-action-items"
      className="mb-6 rounded-lg border-2 border-green-500 dark:border-green-700/40"
    >
      <HeaderTag
        {...(expandable
          ? { type: "button", onClick: () => setExpanded((v) => !v), "aria-expanded": expanded }
          : {})}
        className={`w-full flex items-center gap-3 px-4 py-2.5 ${expandable ? "cursor-pointer" : ""}`}
      >
        <StatusLED color={items.length === 0 ? "green" : "amber"} active size="sm" />
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-green-700 dark:text-green-400">
          Open Action Items
        </span>
        <span
          data-testid="open-items-count"
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums leading-none
            bg-green-200/70 dark:bg-green-900/70 text-green-800 dark:text-green-200"
        >
          {items.length}
        </span>
        <span className="flex-1" />
        {expandable && <span className="text-gray-400 text-lg leading-none">{expanded ? "▾" : "▸"}</span>}
      </HeaderTag>

      {expandable && expanded && (
        <ul className="px-4 pb-3 divide-y divide-green-200/40 dark:divide-green-900/40">
          {state.list.map((item) => (
            <ExitableRow
              key={item.id}
              exiting={state.exiting.has(item.id)}
              onExited={() => handleExited(item.id)}
            >
              <ItemRow item={item} scopedTeamId={scopedTeamId} />
            </ExitableRow>
          ))}
          {onAddItem && <AddItemRow onAdd={onAddItem} />}
        </ul>
      )}
    </section>
  );
}

// app/components/BulkActionsBar.tsx
// Floating action bar that appears when boards are bulk-selected on the
// dashboard. Move-to-team and delete both require an inline confirmation —
// the bar itself morphs into the confirm prompt (Command Deck aesthetic).

import { useState } from "react";
import { CloseIcon, TrashIcon } from "~/images/icons";
import type { TeamSummary } from "~/server/team_model";

interface BulkActionsBarProps {
  count: number;
  teams: TeamSummary[];
  onMove: (teamId: string) => void;   // team id or "none"
  onDelete: () => void;
  onClear: () => void;
}

type Pending = { kind: "move"; teamId: string; teamName: string } | { kind: "delete" } | null;

export function BulkActionsBar({ count, teams, onMove, onDelete, onClear }: BulkActionsBarProps) {
  const [teamId, setTeamId] = useState("");
  const [pending, setPending] = useState<Pending>(null);

  if (count === 0) return null;

  const boardsWord = count === 1 ? "board" : "boards";

  const requestMove = () => {
    if (!teamId) return;
    const teamName = teamId === "none" ? "no crew" : teams.find((t) => t.id === teamId)?.name ?? "crew";
    setPending({ kind: "move", teamId, teamName });
  };

  const confirm = () => {
    if (pending?.kind === "move") onMove(pending.teamId);
    if (pending?.kind === "delete") onDelete();
    setPending(null);
  };

  return (
    <div
      data-testid="bulk-actions-bar"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 flex-wrap
        max-w-[calc(100vw-2rem)] px-5 py-3 rounded-2xl
        bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm text-gray-800 dark:text-white
        border border-blue-300/50 dark:border-blue-500/30
        shadow-lg shadow-blue-500/20 dark:shadow-[0_0_20px_rgba(59,130,246,0.35)]"
    >
      {pending ? (
        <>
          <p className="text-sm font-medium">
            {pending.kind === "move"
              ? `Move ${count} ${boardsWord} to ${pending.teamName}?`
              : `Delete ${count} ${boardsWord}?`}
            {pending.kind === "delete" && (
              <span className="block text-xs font-normal text-red-500 dark:text-red-400">
                This cannot be undone.
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={confirm}
            className={`px-3 py-1.5 rounded-lg text-white text-sm font-medium transition-colors cursor-pointer
              ${pending.kind === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-sm font-semibold tabular-nums shrink-0">
            {count} selected
          </span>
          <span className="h-5 w-px bg-gray-300 dark:bg-gray-700 shrink-0" />
          <label htmlFor="bulk-move-team" className="sr-only">Move to crew</label>
          <select
            id="bulk-move-team"
            aria-label="Move to crew"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="h-8 px-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm cursor-pointer"
          >
            <option value="" disabled>Move to crew…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value="none">No crew</option>
          </select>
          <button
            type="button"
            onClick={requestMove}
            disabled={!teamId}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Move
          </button>
          <button
            type="button"
            onClick={() => setPending({ kind: "delete" })}
            className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer flex items-center gap-1"
          >
            <TrashIcon size="sm" /> Delete
          </button>
          <button
            type="button"
            onClick={onClear}
            title="Clear selection"
            aria-label="Clear selection"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <CloseIcon size="sm" />
          </button>
        </>
      )}
    </div>
  );
}

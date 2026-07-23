// app/components/SortBoardsBanner.tsx
// Conversion-smoothing triage banner: when a user has boards that aren't on
// any team (fresh upgrades, claimed anonymous boards), invite them to sort.
// Dismissal is remembered per-count so the banner returns only when the
// situation changes — helpful, never naggy.

import { useEffect, useState } from "react";
import { StatusLED } from "./StatusLED";

const STORAGE_KEY = "sort_boards_banner_dismissed_at_count";

export function SortBoardsBanner({ count, onSort }: { count: number; onSort: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (count <= 0) {
      setVisible(false);
      return;
    }
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== String(count));
    } catch {
      setVisible(true);
    }
  }, [count]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(count));
    } catch { /* private browsing — just hide it */ }
    setVisible(false);
  };

  if (!visible || count <= 0) return null;

  return (
    <div
      data-testid="sort-boards-banner"
      className="mb-6 flex items-center gap-4 flex-wrap rounded-2xl border border-amber-400/70
        dark:border-amber-600/50 bg-amber-50/70 dark:bg-amber-950/20 px-5 py-4"
    >
      <StatusLED color="amber" active pulse size="md" />
      <div className="flex-1 min-w-[220px]">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          {count === 1
            ? "1 board hasn't joined a crew yet"
            : `${count} boards haven't joined a crew yet`}
        </p>
        <p className="text-sm text-amber-700/90 dark:text-amber-300/80">
          Assign them to crews so everyone can find them — select several and move them together.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onSort}
          className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors cursor-pointer"
        >
          Sort boards now
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="px-3 py-1.5 rounded-lg text-sm text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
        >
          Later
        </button>
      </div>
    </div>
  );
}

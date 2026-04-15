import { useEffect, useRef, useState } from "react";
import { useBoard } from "~/context/BoardContext";
import { InfoIcon } from "~/images/icons";
import { StatusLED } from "./StatusLED";
import { VotingInfoModal } from "./VotingInfoModal";

interface LedConfig {
  color: "green" | "blue" | "amber" | "red";
  active: boolean;
  label: string;
}

export function BoardStatusBar() {
  const {
    showPrompts, votingEnabled, votingAllowed, votingScope,
    notesLocked, boardLocked, columns,
  } = useBoard();

  const [legendOpen, setLegendOpen] = useState(false);
  const [showVotingInfo, setShowVotingInfo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const votesUsed = votingEnabled && votingScope === "board"
    ? columns.flatMap((c) => c.notes).reduce((sum, n) => sum + (n.user_votes ?? 0), 0)
    : 0;
  const votesRemaining = votingAllowed - votesUsed;

  const leds: LedConfig[] = [
    { color: "green", active: showPrompts, label: "Prompts" },
    { color: "blue", active: votingEnabled, label: "Voting" },
    { color: "amber", active: notesLocked || boardLocked, label: "Notes Locked" },
    { color: "red", active: boardLocked, label: "Board Locked" },
  ];

  // Close legend when clicking anywhere outside
  useEffect(() => {
    if (!legendOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setLegendOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [legendOpen]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-2">
      {/* Vote counter */}
      {votingEnabled && votingScope === "board" && (
        <div className="flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
          <span className="hidden sm:inline">Votes</span>
          <span>{votesRemaining}</span>
        </div>
      )}
      {votingEnabled && votingScope !== "board" && (
        <div className="flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
          <span>{votingAllowed}</span>
          <span className="hidden sm:inline">Votes/{votingScope}</span>
        </div>
      )}

      {/* LED pill — row on desktop, fixed 2x2 grid on mobile */}
      <button
        onClick={() => setLegendOpen((v) => !v)}
        title="Board status"
        className="rounded-full border border-gray-300 dark:border-gray-600
          px-2.5 py-1.5
          hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
      >
        {/* Desktop: single row */}
        <div className="hidden sm:flex items-center gap-1.5">
          {leds.map((led) => (
            <StatusLED key={led.label} color={led.color} active={led.active} size="sm" />
          ))}
        </div>
        {/* Mobile: fixed-width 2x2 grid */}
        <div className="grid grid-cols-2 gap-1 w-[18px] sm:hidden">
          {leds.map((led) => (
            <StatusLED key={led.label} color={led.color} active={led.active} size="sm" />
          ))}
        </div>
      </button>

      {/* Legend dropdown */}
      {legendOpen && (
        <div className="absolute top-full right-0 mt-2 z-50
          bg-white dark:bg-gray-800 rounded-lg shadow-lg
          border border-gray-200 dark:border-gray-700
          p-3 min-w-[160px]"
        >
          <div className="space-y-2">
            {leds.map((led) => (
              <div key={led.label} className="flex items-center gap-2">
                <StatusLED color={led.color} active={led.active} size="md" />
                <span className="text-xs text-gray-600 dark:text-gray-300">{led.label}</span>
                {led.label === "Voting" && (
                  <button
                    type="button"
                    title="Voting info"
                    onClick={(e) => { e.stopPropagation(); setShowVotingInfo(true); }}
                    className="text-gray-400 hover:text-blue-500 transition-colors cursor-pointer"
                  >
                    <InfoIcon size="sm" />
                  </button>
                )}
                <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
                  {led.active ? "on" : "off"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <VotingInfoModal isOpen={showVotingInfo} onClose={() => setShowVotingInfo(false)} />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useBoard } from "~/context/BoardContext";
import { RocketIcon, CloseIcon, PaperclipIcon, ChevronDownIcon, TableIcon, DocumentIcon, InfoIcon } from "~/images/icons";
import { exportToCSV, exportToMarkdown, downloadFile } from "~/utils/exportBoard";
import { StatusLED } from "./StatusLED";
import { CommandDeckToggle } from "./CommandDeckToggle";
import { AttachmentModal } from "./AttachmentModal";
import { VotingInfoModal } from "./VotingInfoModal";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

export function CommandDeck() {
  const {
    id: boardId, title, timerRunning, timeLeft, startTimer, stopTimer,
    addColumn, columns, votingEnabled, votingAllowed,
    notesLocked, boardLocked, attachments, updateBoardSettings,
    showPrompts, setShowPrompts, sortNotesByScore,
    voterCount, contributorCount, clearParticipantCounts,
  } = useBoard();

  const [expanded, setExpanded] = useState(true);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showVotingInfo, setShowVotingInfo] = useState(false);
  const [minutes, setMinutes] = useState(3);
  const [seconds, setSeconds] = useState(0);

  // Local toggle state
  const [localVotingEnabled, setLocalVotingEnabled] = useState(votingEnabled);
  const [localVotingAllowed, setLocalVotingAllowed] = useState(votingAllowed);
  const [localNotesLocked, setLocalNotesLocked] = useState(notesLocked);
  const [localBoardLocked, setLocalBoardLocked] = useState(boardLocked);
  const [showVotingWarning, setShowVotingWarning] = useState(false);
  const [pendingVotingEnabled, setPendingVotingEnabled] = useState<boolean | null>(null);

  const clearFetcher = useFetcher();
  const deckRef = useRef<HTMLDivElement>(null);

  // Sync from context
  useEffect(() => {
    setLocalVotingEnabled(votingEnabled);
    setLocalVotingAllowed(votingAllowed);
    setLocalNotesLocked(notesLocked);
    setLocalBoardLocked(boardLocked);
  }, [votingEnabled, votingAllowed, notesLocked, boardLocked]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded]);

  // When clear fetcher completes, apply the pending voting direction and reset counts
  useEffect(() => {
    if (clearFetcher.data && pendingVotingEnabled !== null) {
      clearParticipantCounts();
      updateBoardSettings({
        votingEnabled: pendingVotingEnabled,
        votingAllowed: localVotingAllowed,
        notesLocked: localNotesLocked,
        boardLocked: localBoardLocked,
      });
      setShowVotingWarning(false);
      setPendingVotingEnabled(null);
    }
  }, [clearFetcher.data]);

  const adjustSeconds = (delta: number) => {
    let total = minutes * 60 + seconds + delta;
    total = Math.max(1, total);
    setMinutes(Math.floor(total / 60));
    setSeconds(total % 60);
  };

  const handleStartTimer = () => {
    const totalSeconds = minutes * 60 + seconds;
    if (totalSeconds <= 0) return;
    startTimer(totalSeconds);
  };

  const saveSettings = (overrides: Partial<{ votingEnabled: boolean; votingAllowed: number; notesLocked: boolean; boardLocked: boolean }> = {}) => {
    updateBoardSettings({
      votingEnabled: overrides.votingEnabled ?? localVotingEnabled,
      votingAllowed: overrides.votingAllowed ?? localVotingAllowed,
      notesLocked: overrides.notesLocked ?? localNotesLocked,
      boardLocked: overrides.boardLocked ?? localBoardLocked,
    });
  };

  const handleVotingToggle = (enabled: boolean) => {
    setPendingVotingEnabled(enabled);
    setLocalVotingEnabled(enabled);
    setShowVotingWarning(true);
  };

  const confirmVotingToggle = () => {
    clearFetcher.submit({}, { method: "POST", action: `/app/board/${boardId}/settings` });
  };

  const cancelVotingToggle = () => {
    // Revert local toggle back to what it was
    setLocalVotingEnabled(pendingVotingEnabled === true ? false : true);
    setShowVotingWarning(false);
    setPendingVotingEnabled(null);
  };

  const handleNotesLockToggle = (locked: boolean) => {
    setLocalNotesLocked(locked);
    saveSettings({ notesLocked: locked });
  };

  const handleBoardLockToggle = (locked: boolean) => {
    setLocalBoardLocked(locked);
    saveSettings({ boardLocked: locked });
  };

  const handleVotingAllowedChange = (value: number) => {
    const clamped = clamp(value, 1, 99);
    setLocalVotingAllowed(clamped);
    saveSettings({ votingAllowed: clamped });
  };

  const totalNotes = columns.reduce((sum, c) => sum + c.notes.length, 0);

  // ----- MINIMIZED PILL -----
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        title="Command Deck"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-3 px-5 py-3 h-14
          bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm text-gray-800 dark:text-white rounded-full
          shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30
          dark:shadow-[0_0_20px_rgba(59,130,246,0.4)] dark:hover:shadow-[0_0_30px_rgba(59,130,246,0.6)]
          transition-all cursor-pointer border border-blue-300/50 hover:border-blue-400/70
          dark:border-blue-500/30 dark:hover:border-blue-400/50"
      >
        <RocketIcon size="lg" />
        <span className="hidden sm:inline text-sm font-semibold tracking-wide">Command Deck</span>
        <div className="flex items-center gap-1.5 ml-1">
          <StatusLED color="green" active={showPrompts} size="sm" />
          <StatusLED color="blue" active={votingEnabled} size="sm" />
          <StatusLED color="amber" active={notesLocked || boardLocked} size="sm" />
          <StatusLED color="red" active={boardLocked} size="sm" />
        </div>
      </button>
    );
  }

  // ----- EXPANDED DECK -----
  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 sm:hidden" onClick={() => setExpanded(false)} />

      <div
        ref={deckRef}
        className="fixed z-50
          bottom-0 left-0 right-0 sm:bottom-6 sm:right-6 sm:left-auto
          w-full sm:w-80
          max-h-[70vh] sm:max-h-[80vh] overflow-y-auto
          bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm text-gray-800 dark:text-white
          rounded-t-2xl sm:rounded-2xl
          shadow-2xl dark:shadow-2xl shadow-gray-400/30
          border border-gray-200 dark:border-gray-700/50"
      >
        {/* Mobile drag handle */}
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mt-2 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700/50">
          <h3 className="text-xs font-bold tracking-[0.2em] uppercase bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            Command Deck
          </h3>
          <div className="flex items-center gap-1.5">
            <StatusLED color="green" active={showPrompts} size="sm" />
            <StatusLED color="blue" active={localVotingEnabled} size="sm" />
            <StatusLED color="amber" active={localNotesLocked || localBoardLocked} size="sm" />
            <StatusLED color="red" active={localBoardLocked} size="sm" />
            <button
              onClick={() => setExpanded(false)}
              title="Minimize"
              className="ml-1 p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
            >
              <ChevronDownIcon size="md" />
            </button>
          </div>
        </div>

        {/* Mission Clock */}
        <div className={`px-4 py-3 border-b border-gray-200 dark:border-gray-700/50 ${timerRunning ? "ring-1 ring-green-500/30 rounded-lg mx-2 my-1" : ""}`}>
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500 mb-2">Mission Clock</p>
          {timerRunning ? (
            <div className="text-center">
              <div className="font-mono text-2xl text-green-600 dark:text-green-400 mb-2">{formatTime(timeLeft || 0)}</div>
              <button
                onClick={stopTimer}
                disabled={localBoardLocked}
                className="w-full py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Abort Mission
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-1 mb-2">
                <button onClick={() => adjustSeconds(-60)} disabled={localBoardLocked} className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">-</button>
                <input
                  type="number" min={0} max={999} value={minutes}
                  onChange={(e) => setMinutes(clamp(parseInt(e.target.value || "0", 10), 0, 999))}
                  disabled={localBoardLocked}
                  className="w-10 h-7 text-center bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-gray-800 dark:text-white text-sm font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <span className="text-gray-400 dark:text-gray-500">:</span>
                <input
                  type="number" min={0} max={59} value={seconds.toString().padStart(2, "0")}
                  onChange={(e) => setSeconds(clamp(parseInt(e.target.value || "0", 10), 0, 59))}
                  disabled={localBoardLocked}
                  className="w-10 h-7 text-center bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-gray-800 dark:text-white text-sm font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <button onClick={() => adjustSeconds(60)} disabled={localBoardLocked} className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">+</button>
              </div>
              <button
                onClick={handleStartTimer}
                disabled={localBoardLocked}
                className="w-full py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start Countdown
              </button>
            </>
          )}
        </div>

        {/* Board Controls */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/50">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500 mb-2">Board Controls</p>
          <div className="space-y-2">
            <button
              onClick={addColumn}
              disabled={localBoardLocked}
              className="w-full py-1.5 rounded-lg border border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-400 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Column
            </button>
            <button
              onClick={sortNotesByScore}
              disabled={localBoardLocked}
              title={votingEnabled ? "Sort notes by vote count, then by age" : "Sort notes by likes, then by age"}
              className="w-full py-1.5 rounded-lg border border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-400 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↓ Sort by {votingEnabled ? "Votes" : "Likes"}
            </button>
            <button
              onClick={() => setShowAttachments(true)}
              disabled={localBoardLocked}
              className="w-full py-1.5 rounded-lg border border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-400 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            >
              <PaperclipIcon size="sm" /> Attach File
            </button>
          </div>
        </div>

        {/* System Toggles */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/50">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500 mb-2">System Toggles</p>
          <div className="space-y-2">
            <CommandDeckToggle label="Show Prompts" checked={showPrompts} onChange={setShowPrompts} ledColor="green" disabled={localBoardLocked || showVotingWarning} />
            <CommandDeckToggle
              label="Enable Voting"
              checked={localVotingEnabled}
              onChange={handleVotingToggle}
              ledColor="blue"
              disabled={localBoardLocked || showVotingWarning}
              labelExtra={
                <button
                  type="button"
                  onClick={() => setShowVotingInfo(true)}
                  title="Voting info"
                  className="p-0.5 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <InfoIcon size="xs" />
                </button>
              }
            />
            {showVotingWarning && (
              <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-600/50 text-xs text-amber-800 dark:text-amber-200">
                <p className="font-medium">
                  {pendingVotingEnabled
                    ? "Enabling voting will clear all likes and votes."
                    : "Disabling voting will clear all votes and likes."}
                </p>
                <div className="flex justify-between mt-1">
                  <button onClick={confirmVotingToggle} className="w-[30%] py-0.5 rounded bg-amber-600 text-white text-xs cursor-pointer">Confirm</button>
                  <button onClick={cancelVotingToggle} className="w-[30%] py-0.5 rounded border border-current text-amber-800 dark:text-amber-200 text-xs cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
            {localVotingEnabled && !showVotingWarning && (
              <div className="flex items-center gap-2 pl-4">
                <span className="text-xs text-gray-500 dark:text-gray-400">Votes:</span>
                <input
                  type="number" min={1} max={99} value={localVotingAllowed}
                  onChange={(e) => handleVotingAllowedChange(Number(e.target.value))}
                  disabled={localBoardLocked}
                  className="w-12 h-6 text-center bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-gray-800 dark:text-white text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            )}
            <CommandDeckToggle
              label="Lock Notes"
              checked={localNotesLocked || localBoardLocked}
              onChange={handleNotesLockToggle}
              ledColor="amber"
              disabled={localBoardLocked || showVotingWarning}
            />
            <CommandDeckToggle label="Lock Board" checked={localBoardLocked} onChange={handleBoardLockToggle} ledColor="red" disabled={showVotingWarning} />
          </div>
        </div>

        {/* Export */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/50">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500 mb-2">Export</p>
          <div className="flex gap-2">
            <button
              onClick={() => { const csv = exportToCSV(title, columns); downloadFile(csv, `${title}.csv`, "text/csv"); }}
              className="flex-1 py-1.5 rounded-lg border border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-400 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white text-sm transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <TableIcon size="sm" /> .CSV
            </button>
            <button
              onClick={() => { const md = exportToMarkdown(title, columns, { votingEnabled, votingAllowed, voterCount, attachments, boardUrl: window.location.href }); downloadFile(md, `${title}.md`, "text/markdown"); }}
              className="flex-1 py-1.5 rounded-lg border border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-400 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white text-sm transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <DocumentIcon size="sm" /> .MD
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 py-2 text-[10px] text-gray-600 dark:text-gray-300 flex gap-3 justify-center">
          <span>{totalNotes} note{totalNotes !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{contributorCount} contributor{contributorCount !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{voterCount} voter{voterCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Attachment Modal */}
      {showAttachments && <AttachmentModal onClose={() => setShowAttachments(false)} />}

      {/* Voting Info Modal */}
      <VotingInfoModal isOpen={showVotingInfo} onClose={() => setShowVotingInfo(false)} />
    </>
  );
}

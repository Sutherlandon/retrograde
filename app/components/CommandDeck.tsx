import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useBoard } from "~/context/BoardContext";
import { RocketIcon, CloseIcon, PaperclipIcon, ChevronDownIcon } from "~/images/icons";
import { StatusLED } from "./StatusLED";
import { CommandDeckToggle } from "./CommandDeckToggle";
import { AttachmentModal } from "./AttachmentModal";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

export function CommandDeck() {
  const {
    id: boardId, timerRunning, timeLeft, startTimer, stopTimer,
    addColumn, columns, votingEnabled, votingAllowed,
    notesLocked, boardLocked, attachments, updateBoardSettings,
  } = useBoard();

  const [expanded, setExpanded] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [minutes, setMinutes] = useState(3);
  const [seconds, setSeconds] = useState(0);

  // Local toggle state
  const [localVotingEnabled, setLocalVotingEnabled] = useState(votingEnabled);
  const [localVotingAllowed, setLocalVotingAllowed] = useState(votingAllowed);
  const [localNotesLocked, setLocalNotesLocked] = useState(notesLocked);
  const [localBoardLocked, setLocalBoardLocked] = useState(boardLocked);
  const [showVotingWarning, setShowVotingWarning] = useState(false);

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

  // When clear fetcher completes
  useEffect(() => {
    if (clearFetcher.data) {
      updateBoardSettings({
        votingEnabled: true,
        votingAllowed: localVotingAllowed,
        notesLocked: localNotesLocked,
        boardLocked: localBoardLocked,
      });
      setShowVotingWarning(false);
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
    if (enabled && !votingEnabled) {
      setShowVotingWarning(true);
      setLocalVotingEnabled(true);
    } else {
      setLocalVotingEnabled(enabled);
      setShowVotingWarning(false);
      saveSettings({ votingEnabled: enabled });
    }
  };

  const confirmEnableVoting = () => {
    clearFetcher.submit({}, { method: "POST", action: `/app/board/${boardId}/settings` });
  };

  const cancelEnableVoting = () => {
    setLocalVotingEnabled(false);
    setShowVotingWarning(false);
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
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2 h-12
          bg-gray-900/95 backdrop-blur-sm text-white rounded-full shadow-lg
          shadow-blue-500/20 hover:shadow-blue-500/40 transition-all cursor-pointer
          sm:px-4 sm:rounded-full"
      >
        <RocketIcon size="md" />
        <div className="hidden sm:flex items-center gap-1.5">
          <StatusLED color="green" active={timerRunning} pulse={timerRunning} size="sm" />
          <StatusLED color="blue" active={votingEnabled} size="sm" />
          <StatusLED color="amber" active={notesLocked} size="sm" />
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
          bg-gray-900/95 backdrop-blur-sm text-white
          rounded-t-2xl sm:rounded-2xl shadow-2xl
          border border-gray-700/50"
      >
        {/* Mobile drag handle */}
        <div className="w-10 h-1 rounded-full bg-gray-600 mx-auto mt-2 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
          <h3 className="text-xs font-bold tracking-[0.2em] uppercase bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Command Deck
          </h3>
          <div className="flex items-center gap-1.5">
            <StatusLED color="green" active={timerRunning} pulse={timerRunning} size="sm" />
            <StatusLED color="blue" active={localVotingEnabled} size="sm" />
            <StatusLED color="amber" active={localNotesLocked} size="sm" />
            <StatusLED color="red" active={localBoardLocked} size="sm" />
            <button
              onClick={() => setExpanded(false)}
              title="Minimize"
              className="ml-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronDownIcon size="sm" />
            </button>
          </div>
        </div>

        {/* Mission Clock */}
        <div className={`px-4 py-3 border-b border-gray-700/50 ${timerRunning ? "ring-1 ring-green-500/30 rounded-lg mx-2 my-1" : ""}`}>
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-2">Mission Clock</p>
          {timerRunning ? (
            <div className="text-center">
              <div className="font-mono text-2xl text-green-400 mb-2">{formatTime(timeLeft || 0)}</div>
              <button
                onClick={stopTimer}
                className="w-full py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                Abort Mission
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-1 mb-2">
                <button onClick={() => adjustSeconds(-60)} className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm cursor-pointer">-</button>
                <input
                  type="number" min={0} max={999} value={minutes}
                  onChange={(e) => setMinutes(clamp(parseInt(e.target.value || "0", 10), 0, 999))}
                  className="w-10 h-7 text-center bg-gray-800 border border-gray-700 rounded text-white text-sm font-mono"
                />
                <span className="text-gray-500">:</span>
                <input
                  type="number" min={0} max={59} value={seconds.toString().padStart(2, "0")}
                  onChange={(e) => setSeconds(clamp(parseInt(e.target.value || "0", 10), 0, 59))}
                  className="w-10 h-7 text-center bg-gray-800 border border-gray-700 rounded text-white text-sm font-mono"
                />
                <button onClick={() => adjustSeconds(60)} className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm cursor-pointer">+</button>
              </div>
              <button
                onClick={handleStartTimer}
                className="w-full py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                Launch
              </button>
            </>
          )}
        </div>

        {/* Board Controls */}
        <div className="px-4 py-3 border-b border-gray-700/50">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-2">Board Controls</p>
          <div className="space-y-2">
            {!localNotesLocked && !localBoardLocked && (
              <button
                onClick={addColumn}
                className="w-full py-1.5 rounded-lg border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white text-sm transition-colors cursor-pointer"
              >
                + Add Column
              </button>
            )}
            <button
              onClick={() => setShowAttachments(true)}
              className="w-full py-1.5 rounded-lg border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white text-sm transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <PaperclipIcon size="sm" /> Attach File
            </button>
          </div>
        </div>

        {/* System Toggles */}
        <div className="px-4 py-3 border-b border-gray-700/50">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-2">System Toggles</p>
          <div className="space-y-2">
            <CommandDeckToggle label="Voting" checked={localVotingEnabled} onChange={handleVotingToggle} ledColor="blue" />
            {showVotingWarning && (
              <div className="p-2 rounded bg-amber-900/50 border border-amber-600/50 text-xs text-amber-200">
                <p className="font-medium">Enabling voting clears all likes.</p>
                <div className="flex gap-2 mt-1">
                  <button onClick={confirmEnableVoting} className="px-2 py-0.5 rounded bg-amber-600 text-white text-xs cursor-pointer">Confirm</button>
                  <button onClick={cancelEnableVoting} className="px-2 py-0.5 rounded border border-gray-600 text-gray-300 text-xs cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
            {localVotingEnabled && !showVotingWarning && (
              <div className="flex items-center gap-2 pl-4">
                <span className="text-xs text-gray-400">Votes:</span>
                <input
                  type="number" min={1} max={99} value={localVotingAllowed}
                  onChange={(e) => handleVotingAllowedChange(Number(e.target.value))}
                  className="w-12 h-6 text-center bg-gray-800 border border-gray-700 rounded text-white text-xs"
                />
              </div>
            )}
            <CommandDeckToggle
              label="Lock Notes"
              checked={localNotesLocked || localBoardLocked}
              onChange={handleNotesLockToggle}
              ledColor="amber"
              disabled={localBoardLocked}
            />
            <CommandDeckToggle label="Lock Board" checked={localBoardLocked} onChange={handleBoardLockToggle} ledColor="red" />
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 py-2 text-[10px] text-gray-600">
          {columns.length} col{columns.length !== 1 ? "s" : ""} · {totalNotes} note{totalNotes !== 1 ? "s" : ""} · {attachments.length} attachment{attachments.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Attachment Modal */}
      {showAttachments && <AttachmentModal onClose={() => setShowAttachments(false)} />}
    </>
  );
}

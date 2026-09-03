// app/components/FacilitatorModal.tsx
// "Crew Access" — the Command Deck permissions modal (issue #97, ADR-0006).
// Grant/revoke facilitators by username and toggle open facilitation.

import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { CloseIcon, UserIcon } from "~/images/icons";
import { StatusLED } from "./StatusLED";
import { CommandDeckToggle } from "./CommandDeckToggle";
import { useBoard } from "~/context/BoardContext";
import type { BoardFacilitatorDTO } from "~/server/board.types";

interface CrewData {
  facilitators: BoardFacilitatorDTO[];
  openFacilitation: boolean;
  error?: string;
}

export function FacilitatorModal({
  boardId,
  isOpen,
  onClose,
}: {
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const fetcher = useFetcher<CrewData>();
  const [username, setUsername] = useState("");
  const action = `/app/board/${boardId}/facilitators`;
  // GAP-002: a crewless board (teamName === null) is invariantly open —
  // the toggle to close it doesn't exist here, and the server refuses the
  // write anyway (setOpenFacilitationServer).
  const { teamName } = useBoard();
  const isCrewless = teamName === null;

  useEffect(() => {
    if (isOpen && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(action);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) setUsername("");
  }, [fetcher.state, fetcher.data]);

  if (!isOpen) return null;

  const crew = fetcher.data?.facilitators ?? [];
  const openFacilitation = fetcher.data?.openFacilitation ?? false;

  const grant = () => {
    if (!username.trim()) return;
    fetcher.submit({ username: username.trim() }, { method: "POST", action });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        role="dialog"
        aria-label="Crew Access"
        className="relative w-full max-w-md max-h-[80vh] overflow-y-auto
          bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm text-gray-800 dark:text-white
          rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/50"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700/50">
          <h3 className="text-xs font-bold tracking-[0.2em] uppercase bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            Crew Access
          </h3>
          <button
            onClick={onClose}
            title="Close"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
          >
            <CloseIcon size="md" />
          </button>
        </div>

        {/* Open facilitation */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/50">
          {isCrewless ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Anonymous boards are open to everyone. Move this board to a crew to restrict facilitation.
            </p>
          ) : (
            <>
              <CommandDeckToggle
                label="Open Deck to Everyone"
                checked={openFacilitation}
                onChange={(open: boolean) =>
                  fetcher.submit({ openFacilitation: String(open) }, { method: "PATCH", action })
                }
                ledColor="green"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-1">
                When on, every participant can see and use the Command Deck.
              </p>
            </>
          )}
        </div>

        {/* Crew list */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/50">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500 mb-2">
            Facilitators
          </p>
          {fetcher.state === "loading" && crew.length === 0 ? (
            <p className="text-sm text-gray-400">Loading crew…</p>
          ) : (
            <ul className="space-y-1.5" data-testid="crew-list">
              {crew.map((member) => (
                <li key={member.user_id} className="flex items-center gap-2.5 py-1">
                  <StatusLED color={member.role === "owner" ? "amber" : "green"} active size="sm" />
                  <span className="flex-1 text-sm truncate">{member.username}</span>
                  {member.role === "owner" ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                      Commander
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        fetcher.submit({ userId: member.user_id }, { method: "DELETE", action })
                      }
                      className="text-xs text-red-500 hover:text-red-700 cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Grant access */}
        <div className="px-4 py-3">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500 mb-2">
            Grant Access
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") grant(); }}
              placeholder="Username"
              className="flex-1 border rounded px-3 py-1.5 text-sm border-blue-400 dark:border-blue-800 bg-blue-50 dark:bg-blue-950"
            />
            <button
              type="button"
              onClick={grant}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm cursor-pointer flex items-center gap-1"
            >
              <UserIcon size="sm" /> Grant
            </button>
          </div>
          {fetcher.data?.error && (
            <p className="text-sm text-red-500 mt-2">{fetcher.data.error}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-3">
            Facilitators get full Command Deck access on this board. Grants are
            per-board and are not copied when a board is duplicated.
          </p>
        </div>
      </div>
    </div>
  );
}

// app/components/VotingInfoModal.tsx
// Modal explaining the difference between Like Mode and Voting Mode.

import { ThumbsUpIcon, ArrowUpIcon, ArrowDownIcon } from "~/images/icons";

interface VotingInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VotingInfoModal({ isOpen, onClose }: VotingInfoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div
        data-testid="voting-info-backdrop"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 animate-scaleIn max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-center text-slate-800 dark:text-white mb-4">
          Likes vs Votes
        </h2>

        <div className="space-y-4 mb-5">
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
            <div className="flex items-center gap-2 mb-1.5">
              <ThumbsUpIcon size="sm" className="text-pink-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Like Mode</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-gray-300">Default</span>
            </div>
            <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 ml-6 list-disc">
              <li>Unlimited likes</li>
              <li>Like as many notes as you want</li>
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
            <div className="flex items-center gap-2 mb-1.5">
              <ArrowUpIcon size="sm" className="text-blue-500" />
              <ArrowDownIcon size="sm" className="text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Voting Mode</h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
              Each participant gets a limited number of votes. Use the up arrow to cast a vote and the down arrow to reclaim one. You can stack multiple votes on a single note.
            </p>

            <div className="ml-2 space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-gray-200 mb-1">Vote Scopes</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  The scope controls where your vote limit applies:
                </p>
              </div>

              <div className="pl-2 border-l-2 border-blue-400 dark:border-blue-500">
                <h5 className="text-xs font-semibold text-slate-700 dark:text-gray-200">Per Board</h5>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Your vote limit is shared across the entire board. Voting on any note counts toward one total budget.
                </p>
              </div>

              <div className="pl-2 border-l-2 border-green-400 dark:border-green-500">
                <h5 className="text-xs font-semibold text-slate-700 dark:text-gray-200">Per Column</h5>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Your vote limit resets for each column. You get the full number of votes to spend within every column.
                </p>
              </div>

              <div className="pl-2 border-l-2 border-purple-400 dark:border-purple-500">
                <h5 className="text-xs font-semibold text-slate-700 dark:text-gray-200">Per Note</h5>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Your vote limit applies to each note individually. You can give up to the max votes on every note.
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition cursor-pointer"
        >
          Acknowledged
        </button>
      </div>
    </div>
  );
}

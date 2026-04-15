// app/components/VotingInfoModal.tsx
// Modal explaining the difference between Like Mode and Voting Mode.

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

      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 animate-scaleIn">
        <h2 className="text-lg font-semibold text-center text-slate-800 dark:text-white mb-4">
          Likes vs Votes
        </h2>

        <div className="space-y-4 mb-5">
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
            <div className="flex items-center gap-2 mb-1.5">
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
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Voting Mode</h3>
            </div>
            <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 ml-6 list-disc">
              <li>1 vote per note</li>
              <li>Limited number of votes</li>
            </ul>
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

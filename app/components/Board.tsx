import { useState, useEffect, useRef } from "react";
import { useBoard } from "../context/BoardContext";
import BoardToolbar from "./BoardToolbar";
import Column from "./Column";
import TimerEndModal from "./TimerEndModal";

const noteColors = [
  'bg-yellow-200',
  'bg-green-300',
  'bg-blue-300',
  'bg-red-300',
  'bg-purple-300',
  'bg-pink-300',
];

export default function Board() {
  const { columns, title, offline, timeLeft } = useBoard();
  const [showTimerEndModal, setShowTimerEndModal] = useState(false);
  const prevTimeLeft = useRef<number | null>(null);

  useEffect(() => {
    if (prevTimeLeft.current !== null && prevTimeLeft.current > 0 && timeLeft === 0) {
      setShowTimerEndModal(true);
    }

    prevTimeLeft.current = timeLeft;
  }, [timeLeft]);

  return (
    <main className="p-4">
      <BoardToolbar title={title} />
      <div className="flex flex-wrap gap-4">
        {offline && (
          <div className="w-full p-2 mb-4 text-center bg-red-200 text-red-800 rounded">
            You are currently offline. Changes will be synced when you reconnect.
          </div>
        )}
        {columns.map((col, index) => (
          <Column key={col.id} column={col} noteColor={noteColors[index % noteColors.length]} />
        ))}
      </div>
      <TimerEndModal
        isOpen={showTimerEndModal}
        onClose={() => setShowTimerEndModal(false)}
      />
    </main>
  );
}

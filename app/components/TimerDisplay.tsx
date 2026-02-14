import { useBoard } from "../context/BoardContext";

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const TimerDisplay = () => {
  const { timeLeft } = useBoard();

  if (timeLeft === null) return null;

  return (
    <div className="font-mono text-4xl">
      {formatTime(timeLeft || 0)}
    </div>
  );
};

export default TimerDisplay;

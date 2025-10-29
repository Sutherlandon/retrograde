import { useState, useEffect } from "react";
import Button from "./Button";
import { StopIcon, TimerIcon } from "~/images/icons";
import TimerEndModal from "./TimerEndModal";

const TimerButton = () => {
  const [showOptions, setShowOptions] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null); // in seconds
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showTimerEnded, setShowTimerEnded] = useState(false);

  // Format seconds -> M:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleStart = (minutes: number) => {
    setTimeLeft(minutes * 60);
    setShowOptions(false);
    setTimerRunning(true);
  };

  const handleStop = () => {
    if (timerId) {
      clearInterval(timerId);
    }
    setTimeLeft(null);
    setTimerRunning(false);
    setShowOptions(false);
  }

  // Countdown effect
  useEffect(() => {
    if (timeLeft === null)
      return;

    if (timeLeft === 0) {
      setTimeLeft(null);
      setTimerRunning(false);
      setShowTimerEnded(true);
      return;
    }

    const id = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    setTimerId(id);

    return () => clearInterval(id);
  }, [timeLeft]);

  return (
    <div>
      <Button
        icon={<TimerIcon />}
        text={timeLeft === null ? "Timer" : formatTime(timeLeft)}
        className="relative"
        onClick={() => setShowOptions((prev) => !prev)}
        style={{ width: '75px' }}
      />
      {showOptions && (
        <div className="absolute mt-2 bg-gray-900 rounded shadow-lg p-2 flex flex-col gap-2 w-[75px]">
          {timerRunning
            ? (
              <Button
                icon={<StopIcon />}
                text='Stop'
                onClick={handleStop}
              />
            )
            : [1, 2, 3, 5, 7].map((m) => (
              <Button
                key={m}
                text={`${m} min`}
                onClick={() => handleStart(m)}
              />
            ))
          }
        </div>
      )}
      <TimerEndModal isOpen={showTimerEnded} onClose={() => setShowTimerEnded(false)} />
    </div>
  );
};

export default TimerButton;

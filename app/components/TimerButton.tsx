import { useState, useEffect, useRef } from "react";
import Button from "./Button";
import { StopIcon, TimerIcon } from "~/images/icons";
import TimerEndModal from "./TimerEndModal";

const TimerButton = () => {
  const [showOptions, setShowOptions] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null); // in seconds
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showTimerEnded, setShowTimerEnded] = useState(false);
  const [timeAmount, setTimeAmount] = useState(3);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Detect clicks outside this component and close the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };

    if (showOptions) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    // cleanup
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showOptions]);

  // Format seconds -> M:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleStart = () => {
    setTimeLeft(timeAmount * 60);
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
    <div ref={wrapperRef} className="relative inline-block">
      <Button
        icon={<TimerIcon />}
        text={timeLeft === null ? "Timer" : formatTime(timeLeft)}
        className="relative"
        onClick={() => setShowOptions((prev) => !prev)}
      />
      {showOptions && (
        <div className="absolute mt-2 bg-gray-950 rounded shadow-lg p-2 flex flex-col gap-2 w-[150px] -translate-x-1/4 transform text-center">
          {timerRunning ? (
            <Button
              icon={<StopIcon />}
              text='Stop'
              onClick={handleStop}
            />
          ) : (
            <div>
              <div className="flex gap-1 mb-2">
                <Button
                  text="-"
                  onClick={() => setTimeAmount(timeAmount - 1 || 1)}
                  className="h-8 w-8"
                />
                <div className="p-1 whitespace-nowrap flex-1 center">{timeAmount} min</div>
                <Button
                  text="+"
                  onClick={() => setTimeAmount(timeAmount + 1)}
                  className="h-8 w-8"
                />
              </div>
              <Button
                text="Start"
                onClick={() => handleStart()}
                className="w-full"
              />
            </div>
          )
          }
        </div>
      )}
      <TimerEndModal isOpen={showTimerEnded} onClose={() => setShowTimerEnded(false)} />
    </div>
  );
};

export default TimerButton;

import { useState, useRef, useEffect } from "react";
import Button from "./Button";
import { StopIcon, TimerIcon } from "~/images/icons";
import { useBoard } from "./BoardContext";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const TimerControl = () => {
  const { timerRunning, startTimer, stopTimer } = useBoard();
  const [showOptions, setShowOptions] = useState(false);
  const [minutes, setMinutes] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const adjustSeconds = (delta: number) => {
    let total = minutes * 60 + seconds + delta;
    total = Math.max(1, total); // prevent zero-length timers

    setMinutes(Math.floor(total / 60));
    setSeconds(total % 60);
  };

  const handleStart = () => {
    const totalSeconds = minutes * 60 + seconds;
    if (totalSeconds <= 0) {
      return setError("time must be greater than 0.");
    }

    setError(null);
    startTimer(totalSeconds / 60);
    setShowOptions(false);
  };

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <Button
        icon={<TimerIcon />}
        text="Timer"
        onClick={() => setShowOptions((v) => !v)}
      />

      {showOptions && (
        <div className="absolute mt-2 bg-white dark:bg-slate-800 rounded shadow-xl/30 p-2 flex flex-col gap-2 w-[180px] -translate-x-1/4 transform text-center border border-slate-400 dark:border-slate-700">
          {timerRunning ? (
            <Button
              icon={<StopIcon />}
              text="Stop"
              onClick={() => {
                stopTimer();
                setShowOptions(false);
              }}
            />
          ) : (
            <>
              {/* Time inputs */}
              <div className="flex items-center gap-1">
                <Button
                  text="-"
                  className="h-8 w-8"
                  onClick={() => adjustSeconds(-60)}
                />

                <input
                  min={0}
                  className="w-10 h-8 text-center border rounded border-slate-300 dark:border-slate-700 dark:bg-black"
                  value={minutes}
                  onChange={(e) =>
                    setMinutes(clamp(parseInt(e.target.value || "0", 10), 0, 999))
                  }
                />
                <span className="text-sm">:</span>
                <input
                  min={0}
                  max={59}
                  className="w-10 h-8 text-center border rounded border-slate-300 dark:border-slate-700 dark:bg-black"
                  value={seconds.toString().padStart(2, "0")}
                  onChange={(e) =>
                    setSeconds(
                      clamp(parseInt(e.target.value || "0", 10), 0, 59)
                    )
                  }
                />
                <Button
                  text="+"
                  className="h-8 w-8"
                  onClick={() => adjustSeconds(60)}
                />
              </div>
              {error && (
                <div className="text-xs text-red-500">{error}</div>
              )}
              <Button
                text="Start"
                className="w-full"
                onClick={handleStart}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TimerControl;

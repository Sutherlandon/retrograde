import { StatusLED } from "./StatusLED";

interface CommandDeckToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ledColor: "green" | "blue" | "amber" | "red";
}

const toggleColorMap = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  red: "bg-red-600",
};

export function CommandDeckToggle({ label, checked, onChange, disabled = false, ledColor }: CommandDeckToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <StatusLED color={ledColor} active={checked} size="sm" />
        <span className="text-xs text-gray-600 dark:text-gray-300">{label}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none
          ${checked ? toggleColorMap[ledColor] : "bg-gray-300 dark:bg-gray-600"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform
            ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}

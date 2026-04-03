interface StatusLEDProps {
  color: "green" | "blue" | "amber" | "red";
  active?: boolean;
  pulse?: boolean;
  size?: "sm" | "md";
}

const activeColorMap = {
  green: "bg-green-400",
  blue: "bg-blue-400",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

const sizeMap = {
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
};

export function StatusLED({ color, active = false, pulse = false, size = "md" }: StatusLEDProps) {
  return (
    <span
      className={`rounded-full inline-block ${sizeMap[size]} ${active ? activeColorMap[color] : "bg-gray-600"} ${active && pulse ? "animate-pulse" : ""}`}
    />
  );
}

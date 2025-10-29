// A reusable button component with consistent styling
export default function Button({
  onClick,
  className = '',
  icon,
  text,
  disabled,
  ...props
}: {
  onClick?: () => void;
  className?: string
  [key: string]: any;
  icon?: React.ReactNode;
  text?: string;
  variant?: "text" | "solid" | "outline";
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        ${className ?? ''}
        ${{
          "solid": "bg-blue-600 text-white hover:bg-blue-800",
          "outline": "bg-transparent border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white",
          "text": "bg-transparent text-gray-800 border-transparent hover:bg-[rgba(0,0,0,0.1)]",
        }[props.variant ?? "solid"]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:cursor-pointer'}
        ${Boolean(text) ? 'px-2' : 'px-1'}
        flex items-center justify-center gap-1
        py-1 rounded text-nowrap text-sm
      `}
      disabled={disabled}
      {...props}
    >
      {icon &&
        <span>{icon}</span>
      }
      {text &&
        <span>{text}</span>
      }
    </button>
  );
}
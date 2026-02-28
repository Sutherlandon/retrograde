import clsx from "clsx";
import { twMerge } from "tailwind-merge";

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

const ButtonInner = ({
  icon,
  iconPosition,
  text,
}: {
  icon?: React.ReactNode;
  iconPosition: "left" | "right";
  text?: string;
}) => (
  <>
    {icon && iconPosition === "left" && <span>{icon}</span>}
    {text && <span>{text}</span>}
    {icon && iconPosition === "right" && <span>{icon}</span>}
  </>
);

export interface ButtonProps {
  as?: "button" | "a";
  onClick?: () => void;
  className?: string;
  color?: "primary" | "secondary" | "danger" | "muted";
  href?: string;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  size?: "sm" | "md";
  text?: string;
  variant?: "text" | "solid" | "outline";
  disabled?: boolean;
  [key: string]: any;
}

export default function Button({
  as,
  onClick,
  className,
  href,
  icon,
  iconPosition = "left",
  text,
  disabled,
  size = "md",
  color,
  variant = "solid",
  ...props
}: ButtonProps) {
  const classNames = cn(
    // Base styles
    "flex items-center justify-center gap-2 rounded text-nowrap text-sm",
    size === "sm" ? "px-2 py-1" : "px-4 py-2",
    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",

    // Solid variant
    variant === "solid" && [
      "text-white shadow-md/20",
      {
        "bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-800": color === "primary" || !color,
        "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-800": color === "secondary",
        "bg-red-500 hover:bg-red-600": color === "danger",
        "bg-gray-500 hover:bg-gray-600": color === "muted",
      },
    ],

    // Outline variant
    variant === "outline" && [
      "bg-transparent border hover:text-white",
      {
        "border-blue-500 text-blue-500 hover:bg-blue-800": color === "primary" || !color,
        "border-green-500 text-green-500 hover:bg-green-800": color === "secondary",
        "border-red-500 text-red-500 hover:bg-red-600": color === "danger",
        "border-gray-500 text-gray-500 hover:bg-gray-600": color === "muted",
      },
    ],

    // Text variant
    variant === "text" && [
      "bg-transparent border-transparent",
      {
        "hover:bg-gray-100 dark:hover:bg-gray-700": !color,
        "text-blue-500 hover:bg-gray-300": color === "primary",
        "text-green-500 hover:bg-gray-300": color === "secondary",
        "text-red-500 hover:bg-gray-300": color === "danger",
        "text-gray-500 hover:bg-gray-600": color === "muted",
      },
    ],

    // Caller overrides — always last so they win
    className
  );

  const inner = <ButtonInner icon={icon} iconPosition={iconPosition} text={text} />;

  if (as === "a") {
    return (
      <a className={cn(classNames, "w-fit")} href={href} {...props}>
        {inner}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={classNames} disabled={disabled} {...props}>
      {inner}
    </button>
  );
}
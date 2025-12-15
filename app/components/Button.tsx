const ButtonInner = ({
  icon,
  iconPosition,
  text,
}: {
  icon?: React.ReactNode,
  iconPosition: 'left' | 'right',
  text?: string
}) => (
  <>
    {icon && iconPosition === 'left' &&
      <span>{icon}</span>
    }
    {text &&
      <span>{text}</span>
    }
    {icon && iconPosition === 'right' &&
      <span>{icon}</span>
    }
  </>
)

export interface ButtonProps {
  as?: "button" | "a";
  onClick?: () => void;
  className?: string
  color?: "primary" | "secondary";
  href?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  text?: string;
  variant?: "text" | "solid" | "outline";
  disabled?: boolean;
  [key: string]: any;
}

// A reusable button component with consistent styling
export default function Button({
  as,
  onClick,
  className = '',
  href,
  icon,
  iconPosition = 'left',
  text,
  disabled,
  ...props
}: ButtonProps) {
  // Calculate the classnames
  const classNames = `${className ?? ''
    } ${{
      "solid": `text-white shadow-md/20 ${{
        "primary": "bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-800",
        "secondary": "bg-green-500 hover:bg-blue-600 dark:bg-green-600 dark:hover:bg-green-800",
      }[props.color ?? "primary"]}`,
      "outline": "bg-transparent border border-green-500 text-green-500 hover:bg-green-800 hover:text-white",
      "text": "bg-transparent border-transparent hover:bg-[rgba(0,0,0,0.1)]",
    }[props.variant ?? "solid"]
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:cursor-pointer'
    } flex items-center justify-center gap-2 py-1 px-2 rounded text-nowrap text-sm`

  const inner = <ButtonInner icon={icon} iconPosition={iconPosition} text={text} />

  if (as === 'a') {
    return (
      <a
        className={`${classNames} w-fit`}
        href={href}
        {...props}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      className={classNames}
      disabled={disabled}
      {...props}
    >
      {inner}
    </button>
  );
}
// A reusable button component with consistent styling
export default function Button({
  children,
  onClick,
  className = '',
  ...props
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string
  [key: string]: any;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-800 hover:cursor-pointer ${className ?? ''}`}
      {...props}
    >
      {children}
    </button>
  );
}
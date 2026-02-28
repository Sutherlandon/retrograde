import { useState, useRef, useEffect } from 'react';
import { MoonIcon, SunIcon, UserIcon, ComputerIcon } from '~/images/icons';
import { useTheme } from '~/hooks/useTheme';
import Button from './Button';

interface AccountHubProps {
  user?: {
    id: string;
    username: string;
  };
  home: boolean;
  closeMenu?: () => void;
}

export default function AccountHub({ user, home = false, closeMenu }: AccountHubProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { theme, resolvedTheme, setTheme } = useTheme();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        open &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        closeMenu?.();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        closeMenu?.();
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <div className="relative z-1" ref={containerRef}>
      {user && !home ? (
        <Button
          ref={buttonRef}
          onClick={() => setOpen(!open)}
          // variant={resolvedTheme === 'dark' ? 'outline' : 'solid'}
          color='secondary'
          text={user?.username}
          icon={<UserIcon size="md" />}
          className="px-4 py-2"
          aria-expanded={open}
          aria-haspopup="menu"
        />
      ) : (
        <Button
          as="a"
          href="/login"
          variant='solid'
          color='secondary'
          text={"Log In"}
          icon={<UserIcon size="md" />}
          className="px-4 py-2"
        />
      )}

      {/* Dropdown */}
      <div
        className={`absolute right-0 mt-2 w-60 bg-white dark:bg-gray-900 shadow-lg rounded-lg border border-green-500 transition-all duration-200 origin-top-right ${open
          ? 'opacity-100 scale-100'
          : 'opacity-0 scale-95 pointer-events-none'
          }`}
        role="menu"
      >
        <div className="p-4 flex flex-col gap-4">
          {/* Dashboard Link */}
          <a
            href="/app/dashboard"
            className="hover:underline"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </a>

          {/* Theme Section */}
          <div className="inline-flex justify-between items-center w-full">
            <div className="text-sm font-semibold mr-1">
              Theme
            </div>
            <Button
              onClick={() => setTheme('light')}
              variant="text"
              icon={<SunIcon size="sm" />}
              title="Light Mode"
            />
            <Button
              onClick={() => setTheme('dark')}
              variant="text"
              icon={<MoonIcon size="sm" />}
              title="Dark Mode"
            />
            <Button
              onClick={() => setTheme('system')}
              variant="text"
              icon={<ComputerIcon size="sm" />}
              title="System Default"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

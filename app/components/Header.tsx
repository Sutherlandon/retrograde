import { useState, useRef, useEffect } from 'react';
import { Logo } from '~/images/icons';
import { siteConfig } from '~/config/siteConfig';
import AccountHub from './AccountHub';

interface HeaderProps {
  home?: boolean;
  user?: {
    id: string;
    username: string;
  };
}

export default function Header({ home = false, user }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const siteLogo = siteConfig.logoLight && siteConfig.logoDark;

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        mobileOpen &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setMobileOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileOpen]);

  // Close on ESC
  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  // Lock body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
  }, [mobileOpen]);

  function closeMenu() {
    setMobileOpen(false);
  }

  return (
    <header
      className={`relative flex items-center px-4 py-3 ${home
        ? 'bg-black'
        : 'bg-gradient-to-b from-sky-400 to-white dark:from-black dark:to-gray-900'
        }`}
    >
      {/* Logo */}
      <a href="/" className="flex items-center">
        <Logo size="2xl" className="mr-2" />
        <div className={`text-2xl font-bold ${siteLogo ? "hidden sm:block" : ""}`}>
          Retrograde
        </div>

        {siteLogo && (
          <div className="ml-4 border-l-2 border-gray-900 dark:border-gray-100 px-4 py-1">
            <img
              src={siteConfig.logoLight}
              alt={siteConfig.logoAlt}
              className="h-8 dark:hidden"
            />
            <img
              src={siteConfig.logoDark}
              alt={siteConfig.logoAlt}
              className="h-8 hidden dark:block"
            />
          </div>
        )}
      </a>

      <div className="flex-grow" />

      {/* Desktop Nav */}
      <nav className="hidden sm:flex items-center gap-6 mr-4">
        <a href="/about" className="hover:underline">
          About
        </a>
        <a href="/contact" className="hover:underline">
          Contact
        </a>
        <AccountHub user={user} home={home} />
      </nav>

      {/* Hamburger */}
      <button
        ref={buttonRef}
        className="sm:hidden relative z-50"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-expanded={mobileOpen}
        aria-controls="mobile-menu"
        aria-label="Toggle navigation menu"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          {mobileOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Overlay */}
      <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200 sm:hidden ${mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />

      {/* Mobile Menu */}
      <div
        id="mobile-menu"
        ref={menuRef}
        className={`fixed top-0 right-0 h-full w-72 bg-white dark:bg-gray-900 shadow-xl transform transition-transform duration-300 ease-in-out sm:hidden z-50 flex flex-col gap-6 p-6 ${mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        role="menu"
      >
        <AccountHub user={user} home={home} closeMenu={closeMenu} />
        <a href="/about" className="hover:underline" onClick={closeMenu}>
          About
        </a>
        <a href="/contact" className="hover:underline" onClick={closeMenu}>
          Contact
        </a>
      </div>
    </header>
  );
}

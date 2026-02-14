import Button from './Button';
import { Logo, UserIcon } from '~/images/icons';
import { siteConfig } from '~/config/siteConfig';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  home?: boolean;
  user?: {
    id: string;
    username: string;
  };
}

export default function Header({ home, user }: HeaderProps) {
  const hostname = import.meta.env.VITE_HOSTNAME;

  return (
    <header className={`flex gap-4 items-center px-4 py-3 ${home ? 'bg-black' : 'bg-gradient-to-b from-sky-400 to-white dark:from-black dark:to-gray-900'}`}>
      <a
        href="/"
        className="flex justify-between items-center hover:cursor-pointer"
      >
        <Logo size="2xl" className='mr-2' />
        <div className="text-2xl font-bold">Retrograde</div>
        {siteConfig.logoLight && siteConfig.logoDark && (
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
      <nav className="flex gap-6 mr-4">
        {hostname === "localhost" && (
          <a href="/board/dev-test" className="hover:underline">
            dev-test
          </a>
        )}

        <a href="/about" className="hover:underline">
          About
        </a>
        <a href="/contact" className="hover:underline">
          Contact
        </a>
      </nav>
      {!home && <ThemeToggle />}
      <Button
        as="a"
        href="/board/dev-test"
        variant="solid"
        color='secondary'
        text={user?.username || "Login"}
        icon={<UserIcon size="md" />}
        className='px-4 py-2'
      />
    </header >
  );
}

import Button from './Button';
import { feature } from '~/features';
import { Logo, MoonIcon, SunIcon, UserIcon } from '~/images/icons';
import { useTheme } from '~/useTheme';

export function ThemeToggle() {
  const { theme, resolvedTheme, toggleTheme } = useTheme()

  return (
    <Button
      onClick={toggleTheme}
      className="rounded-lg p-2 cursor-pointer hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
      aria-label="Toggle theme"
      variant='text'
      color='primary'
      icon={resolvedTheme === 'dark' ? <SunIcon size='lg' /> : <MoonIcon size='lg' />}
    />
  )
}

export default function Header({ home, user }: { home?: boolean, user: { id: string, username: string } }) {
  return (
    <header className={`flex items-center px-4 py-3 ${home ? 'bg-black' : 'bg-gradient-to-b from-sky-400 to-white dark:from-black dark:to-gray-900'}`}>
      <a
        href="/"
        className="flex justify-between items-center hover:cursor-pointer"
      >
        <Logo size="2xl" className='mr-2' />
        <div className="text-2xl font-bold">Retrograde</div>
      </a>
      <div className="flex-grow" />
      <nav className="flex gap-4 mr-4">
        <a href="/about" className="hover:underline">
          About
        </a>
        <a href="/contact" className="hover:underline">
          Contact
        </a>
      </nav>
      <div className="flex items-center gap-2 ml-8 border border-gray-300 rounded-lg px-4 py-2">
        <UserIcon size='lg' />
        <div className="ml-2">{user.username}</div>
      </div>
      {!home && <ThemeToggle />}
    </header>
  );
}

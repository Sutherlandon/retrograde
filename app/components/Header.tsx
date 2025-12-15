import Button from './Button';
import { feature } from '~/features';
import { Logo, MoonIcon, SunIcon, UserIcon } from '~/images/icons';
import { useTheme } from '~/useTheme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="rounded-lg p-2 cursor-pointer hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
      aria-label="Toggle theme"
      variant='text'
      color='primary'
      icon={theme === 'dark' ? <SunIcon size='lg' /> : <MoonIcon size='lg' />}
    />
  )
}

export default function Header({ home }: { home?: boolean }) {
  return (
    <header className={`flex items-center px-4 py-3 ${home ? 'bg-black' : 'bg-gradient-to-b from-sky-400 to-white dark:from-black dark:to-gray-900'}`}>
      <a
        href="/"
        className="flex justify-between items-center hover:cursor-pointer"
      >
        <Logo size="2xl" className='mr-2' />
        <h1 className="text-2xl font-bold">Retrograde</h1>
      </a>
      <div className="flex-grow" />
      {feature('--accounts') &&
        <Button
          as='a'
          href="/signup"
          text="Sign in"
          color='secondary'
          icon={<UserIcon />}
          variant='outline'
          className='py-2 px-4'
        />
      }
      {!home && <ThemeToggle />}
    </header>
  );
}

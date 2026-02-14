import Button from '~/components/Button';
import { MoonIcon, SunIcon } from '~/images/icons';
import { useTheme } from '~/hooks/useTheme';

export default function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme()

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
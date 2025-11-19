import { Logo, UserIcon } from '~/images/icons';
import Button from './Button';

export default function Header() {
  return (
    <header className='flex items-center bg-black text-gray-100 px-4 py-3'>
      <a
        href="/"
        className="flex justify-between items-center text-white hover:cursor-pointer"
      >
        <Logo size="2xl" className='mr-2' />
        <h1 className="text-2xl font-bold">Retrograde</h1>
      </a>
      <div className="flex-grow" />
      <Button
        as='a'
        href="/signup"
        text="Sign in"
        color='secondary'
        icon={<UserIcon />}
        variant='outline'
        className='py-2'
      />
    </header>
  );
}

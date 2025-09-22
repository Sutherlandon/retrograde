import logo from '~/images/retrograde_logo.svg';

export default function Header() {
  return (
    <header className='flex items-center bg-slate-950 text-gray-100 px-4 py-3'>
      <a
        href="/"
        className="flex justify-between items-center text-white hover:cursor-pointer"
      >
        <img src={logo} alt="Retrograde Logo" className="h-8 w-8 mr-2" />
        <h1 className="text-lg font-bold">Retrograde</h1>
      </a>
      <div className="flex-grow" />
      <a
        href="/board/example-board"
        className="text-gray-200 px-3 py-1 rounded transition hover:cursor-pointer hover:bg-blue-500 hover:text-white"
      >
        View Example Board
      </a>
    </header>
  );
}

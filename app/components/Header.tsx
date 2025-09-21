import logo from '~/images/retrograde_logo.svg';

export default function Header() {
  return (
    <header className="flex justify-between items-center bg-blue-600 text-white px-4 py-3">
      <img src={logo} alt="Retrograde Logo" className="h-8 w-8 mr-2" />
      <h1 className="text-lg font-bold">Retrograde</h1>
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

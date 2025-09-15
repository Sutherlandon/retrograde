import logo from '~/images/retrograde_logo.svg';

export default function Header() {
  return (
    <header className="flex justify-between items-center bg-blue-600 text-white px-4 py-3">
      <img src={logo} alt="Retrograde Logo" className="h-8 w-8 mr-2" />
      <h1 className="text-lg font-bold">Retrograde</h1>
      <div className="flex-grow" />
    </header>
  );
}

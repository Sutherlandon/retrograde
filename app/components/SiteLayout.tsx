/**
 * Layout for the website pages.
 */
import Header from "./Header";
import Footer from "./Footer";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='text-gray-100 min-h-screen flex flex-col'>
      <Header home />
      <main className="flex-grow">{/* Main content area */}
        {children}
      </main>
      <Footer />
    </div>
  );
}
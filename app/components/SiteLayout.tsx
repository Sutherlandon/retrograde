/**
 * Layout for the website pages.
 */
import Header from "~/components/Header";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='text-gray-100 h-screen'>
      <Header home />
      {children}
    </div>
  );
}
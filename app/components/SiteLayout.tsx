/**
 * Layout for the website pages — authentication is optional.
 * If a user is logged in, their profile is shown in the header.
 */
import { useLoaderData, Outlet } from "react-router";
import { getOptionalUser } from "~/hooks/useAuth";
import { UserProvider } from "~/context/userContext";
import Header from "./Header";
import Footer from "./Footer";

export async function loader({ request }: { request: Request }) {
  const user = await getOptionalUser(request);
  return { user };
}

export default function SiteLayout() {
  const { user } = useLoaderData();

  return (
    <UserProvider user={user}>
      <div className='min-h-screen flex flex-col'>
        <Header user={user} />
        <main className="flex-grow">
          <Outlet />
        </main>
        <Footer />
      </div>
    </UserProvider>
  );
}
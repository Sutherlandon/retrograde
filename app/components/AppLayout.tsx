/**
 * Layout for the app pages.
 */
import { useLoaderData, Outlet } from "react-router";
import { requireUser } from "~/hooks/useAuth";
import { UserProvider } from "~/context/userContext";
import Header from "./Header";

export async function loader({ request }: { request: Request }) {
  const user = await requireUser(request);
  return { user };
}

export default function AppLayout() {
  const { user } = useLoaderData();

  return (
    <UserProvider user={user}>
      <div className='text-gray-100 min-h-screen flex flex-col'>
        <Header user={user} />
        <Outlet />
      </div>
    </UserProvider>
  );
}

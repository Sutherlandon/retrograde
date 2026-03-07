/**
 * Layout for board pages — authentication is optional.
 * Anonymous users can view and interact with boards.
 */
import { useLoaderData, Outlet } from "react-router";
import { getOptionalUser } from "~/hooks/useAuth";
import { UserProvider } from "~/context/userContext";
import Header from "./Header";

export async function loader({ request }: { request: Request }) {
  const user = await getOptionalUser(request);
  return { user };
}

export default function BoardLayout() {
  const { user } = useLoaderData();

  return (
    <UserProvider user={user}>
      <div className='min-h-screen flex flex-col'>
        <Header user={user} />
        <Outlet />
      </div>
    </UserProvider>
  );
}

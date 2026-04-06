/**
 * Layout for board pages — authentication is optional.
 * Anonymous visitors get an auto-created anonymous user record so they can
 * fully interact with the board (vote, like, own boards they create, etc.).
 */
import { useLoaderData, Outlet } from "react-router";
import { getOrCreateUser } from "~/hooks/useAuth";
import { commitSession } from "~/session.server";
import { UserProvider } from "~/context/userContext";
import Header from "./Header";

export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const { user, session, isNew } = await getOrCreateUser(request, params.id);
  const headers: HeadersInit = {};
  if (isNew) {
    headers["Set-Cookie"] = await commitSession(session);
  }
  return Response.json({ user }, { headers });
}

export default function BoardLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <UserProvider user={user}>
      <div className='min-h-screen flex flex-col'>
        <Header user={user} />
        <Outlet />
      </div>
    </UserProvider>
  );
}

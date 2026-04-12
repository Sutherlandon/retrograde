/**
 * Layout for the app pages.
 */
import { useLoaderData, Outlet } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { UserProvider } from "~/context/userContext";
import { pool, siteAdminIds } from "~/server/db_config";
import { isGrantedAdmin } from "~/server/admin_model";
import Header from "./Header";

export async function loader({ request }: { request: Request }) {
  const user = await requireRegisteredUser(request);

  const userRow = await pool.query(
    "SELECT external_id FROM users WHERE id = $1",
    [user.id]
  );
  const externalId: string | undefined = userRow.rows[0]?.external_id;
  const isSiteAdmin = Boolean(externalId && siteAdminIds.includes(externalId));
  const isAdmin = isSiteAdmin || await isGrantedAdmin(user.id);

  return { user, isAdmin };
}

export default function AppLayout() {
  const { user, isAdmin } = useLoaderData();

  return (
    <UserProvider user={user}>
      <div className='min-h-screen flex flex-col'>
        <Header user={user} isAdmin={isAdmin} />
        <Outlet />
      </div>
    </UserProvider>
  );
}

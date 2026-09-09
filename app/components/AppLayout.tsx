/**
 * Layout for the app pages.
 */
import { useLoaderData, Outlet } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { UserProvider } from "~/context/userContext";
import { pool, siteAdminIds } from "~/server/db_config";
import { isGrantedAdmin } from "~/server/admin_model";
import { listTeamsForUser } from "~/server/team_model";
import { countUnassignedBoardsForUser } from "~/server/board_model";
import { accountCanCreateNamedCrew } from "~/server/entitlements";
import Header from "./Header";
import Sidebar from "./Sidebar";

export async function loader({ request }: { request: Request }) {
  const user = await requireRegisteredUser(request);

  const userRow = await pool.query(
    "SELECT external_id FROM users WHERE id = $1",
    [user.id]
  );
  const externalId: string | undefined = userRow.rows[0]?.external_id;
  const isSiteAdmin = Boolean(externalId && siteAdminIds.includes(externalId));
  const isAdmin = isSiteAdmin || await isGrantedAdmin(user.id);

  // Crew selector data — rendered in the sidebar on every app page.
  const [teams, unassignedCount, isSubscribed] = await Promise.all([
    listTeamsForUser(user.id),
    countUnassignedBoardsForUser(user.id),
    accountCanCreateNamedCrew(user.id), // gates the sidebar's Billing link (ADR-0013)
  ]);

  return { user, isAdmin, teams, unassignedCount, isSubscribed };
}

export default function AppLayout() {
  const { user, isAdmin, teams, unassignedCount, isSubscribed } = useLoaderData();

  return (
    <UserProvider user={user}>
      <div className='min-h-screen flex flex-col'>
        <Header user={user} isAdmin={isAdmin} teams={teams} unassignedCount={unassignedCount} isSubscribed={isSubscribed} />
        <div className="flex flex-1 min-h-0">
          <aside className="hidden sm:block w-56 shrink-0 border-r border-gray-200 dark:border-gray-700/50 py-4 px-2">
            <Sidebar isAdmin={isAdmin} teams={teams} unassignedCount={unassignedCount} isSubscribed={isSubscribed} />
          </aside>
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </div>
      </div>
    </UserProvider>
  );
}

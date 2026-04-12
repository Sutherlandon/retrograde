// app/routes/app/admin.dashboard.tsx
// Admin dashboard: aggregate usage metrics + granted-admin management.
// Site admins (SITE_ADMIN_IDS env var) see everything and can manage other admins.
// Granted admins (admin_users table) see metrics only.

export const meta = () => [{ title: "Admin Dashboard – Retrograde" }];

import { useEffect, useRef } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { pool, siteAdminIds } from "~/server/db_config";
import { getMetrics, type MetricsDTO } from "~/server/metrics_model";
import { isGrantedAdmin, listGrantedAdmins, type GrantedAdmin } from "~/server/admin_model";

export async function loader({ request }: { request: Request }) {
  const user = await requireRegisteredUser(request);

  const userRow = await pool.query(
    "SELECT external_id FROM users WHERE id = $1",
    [user.id]
  );
  const externalId: string | undefined = userRow.rows[0]?.external_id;
  const isSiteAdmin = Boolean(externalId && siteAdminIds.includes(externalId));

  if (!isSiteAdmin && !(await isGrantedAdmin(user.id))) {
    throw new Response("Forbidden", { status: 403 });
  }

  const [metrics, grantedAdmins] = await Promise.all([
    getMetrics(),
    isSiteAdmin ? listGrantedAdmins() : Promise.resolve([]),
  ]);

  return { metrics, isSiteAdmin, grantedAdmins };
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, description }: { label: string; value: number; description: string }) {
  return (
    <div className="border rounded-lg p-6 flex flex-col gap-2 bg-white dark:bg-gray-900">
      <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
        {value.toLocaleString()}
      </div>
      <div className="text-lg font-semibold">{label}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{description}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manage Admins (site admins only)
// ---------------------------------------------------------------------------

function ManageAdmins({ grantedAdmins }: { grantedAdmins: GrantedAdmin[] }) {
  const addFetcher    = useFetcher<{ success?: boolean; addedUsername?: string; error?: string }>();
  const removeFetcher = useFetcher<{ success?: boolean; error?: string }>();
  const formRef       = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (addFetcher.data?.success) formRef.current?.reset();
  }, [addFetcher.data]);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Manage Admins</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Site admins are set via the <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">SITE_ADMIN_IDS</code> environment variable and are not listed here.
      </p>

      {grantedAdmins.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-600 mb-6">No granted admins yet.</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg mb-6">
          <table className="table-auto w-full">
            <thead>
              <tr>
                <th className="text-left px-4 py-2 border-b-2">Username</th>
                <th className="text-left px-4 py-2 border-b-2">Granted</th>
                <th className="px-4 py-2 border-b-2" />
              </tr>
            </thead>
            <tbody>
              {grantedAdmins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 border-b dark:border-gray-700">{admin.username}</td>
                  <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500">
                    {new Date(admin.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 border-b dark:border-gray-700 text-right">
                    <removeFetcher.Form method="post" action="/app/admin/admins">
                      <input type="hidden" name="intent"  value="remove" />
                      <input type="hidden" name="userId"  value={admin.userId} />
                      <button type="submit" className="text-sm text-red-500 hover:text-red-700 cursor-pointer">
                        Remove
                      </button>
                    </removeFetcher.Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="text-sm font-semibold mb-2">Grant access by username</h3>
      <addFetcher.Form ref={formRef} method="post" action="/app/admin/admins" className="flex gap-2 items-start flex-wrap">
        <input type="hidden" name="intent" value="add" />
        <div className="flex flex-col gap-1">
          <input
            type="text"
            name="username"
            placeholder="Username"
            required
            className="border rounded px-3 py-1.5 border-blue-400 dark:border-blue-800 bg-blue-50 dark:bg-blue-950"
          />
          {addFetcher.data?.error   && <p className="text-sm text-red-500">{addFetcher.data.error}</p>}
          {addFetcher.data?.success && <p className="text-sm text-green-600">Access granted to {addFetcher.data.addedUsername}.</p>}
        </div>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm cursor-pointer"
        >
          Grant Access
        </button>
      </addFetcher.Form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const { metrics, isSiteAdmin, grantedAdmins } = useLoaderData<typeof loader>() as {
    metrics: MetricsDTO;
    isSiteAdmin: boolean;
    grantedAdmins: GrantedAdmin[];
  };

  return (
    <div className="px-8 mx-auto w-full sm:w-[80%]">
      <h1 className="text-3xl font-semibold mb-2">Admin Dashboard</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Aggregate usage metrics — no personally identifiable information is displayed.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
        <StatCard label="Registered Users"  value={metrics.registeredUsers} description="Non-anonymous accounts created via OAuth." />
        <StatCard label="Notes Created"     value={metrics.totalNotes}      description="Total sticky notes across all boards." />
        <StatCard label="Active Boards"     value={metrics.activeBoards}    description="Boards with real usage: a second contributor added a note, or the owner created 5 or more notes." />
        <StatCard label="Engaged Users"     value={metrics.engagedUsers}    description="Registered users who are members of at least one active board." />
      </div>

      {isSiteAdmin && (
        <div className="border-t pt-8 mt-4">
          <ManageAdmins grantedAdmins={grantedAdmins} />
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-600 mt-8">
        Data reflects the current state of the database.
      </p>
    </div>
  );
}

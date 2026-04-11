// app/routes/app/admin.dashboard.tsx
// Admin metrics dashboard — access restricted to users listed in siteConfig.adminUsers.
// Displays aggregate usage counts only; no per-user or per-board details.

export const meta = () => [{ title: "Admin Dashboard – Retrograde" }];

import { useLoaderData } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { pool } from "~/server/db_config";
import { siteConfig } from "~/config/siteConfig";
import { getMetrics, type MetricsDTO } from "~/server/metrics_model";

export async function loader({ request }: { request: Request }) {
  const user = await requireRegisteredUser(request);

  const userRow = await pool.query(
    "SELECT external_id FROM users WHERE id = $1",
    [user.id]
  );
  const externalId: string | undefined = userRow.rows[0]?.external_id;

  if (!externalId || !siteConfig.adminUsers.includes(externalId)) {
    throw new Response("Forbidden", { status: 403 });
  }

  const metrics = await getMetrics();
  return { metrics };
}

interface StatCardProps {
  label: string;
  value: number;
  description: string;
}

function StatCard({ label, value, description }: StatCardProps) {
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

export default function AdminDashboard() {
  const { metrics } = useLoaderData<typeof loader>() as { metrics: MetricsDTO };

  return (
    <div className="px-8 mx-auto w-full sm:w-[80%]">
      <h1 className="text-3xl font-semibold mb-2">Admin Dashboard</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Aggregate usage metrics — no personally identifiable information is displayed.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
        <StatCard
          label="Registered Users"
          value={metrics.registeredUsers}
          description="Non-anonymous accounts created via OAuth."
        />
        <StatCard
          label="Notes Created"
          value={metrics.totalNotes}
          description="Total sticky notes across all boards."
        />
        <StatCard
          label="Active Boards"
          value={metrics.activeBoards}
          description="Boards with real usage: a second contributor added a note, or the owner created 5 or more notes."
        />
        <StatCard
          label="Engaged Users"
          value={metrics.engagedUsers}
          description="Registered users who are members of at least one active board."
        />
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-600">
        Data reflects the current state of the database.
      </p>
    </div>
  );
}

// app/components/Sidebar.tsx
// Persistent navigation for the authenticated app area, plus the crew
// selector: a second menu listing every crew (and Unassigned, when teamless
// boards exist) that filters the dashboard via ?team=. Also reused inline
// inside Header's mobile slide-out menu so the same links stay reachable
// on small screens.
import { useLocation } from "react-router";
import { RocketIcon, AstronautIcon, LockIcon, type IconProps } from "~/images/icons";
import { StatusLED } from "./StatusLED";
import type { TeamSummary } from "~/server/team_model";

interface SidebarProps {
  isAdmin?: boolean;
  teams?: TeamSummary[];
  unassignedCount?: number;
  onNavigate?: () => void;
  className?: string;
}

const navItems: {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  adminOnly?: boolean;
}[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: RocketIcon },
  { href: "/app/crews", label: "Crews", icon: AstronautIcon },
  { href: "/app/admin/dashboard", label: "Admin", icon: LockIcon, adminOnly: true },
];

const rowClasses = (active: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
  }`;

function CrewRow({ href, active, amber, count, onNavigate, children }: {
  href: string;
  active: boolean;
  amber?: boolean;
  count: number;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={amber && !active
          ? "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
          : rowClasses(active)}
      >
        <StatusLED color={amber ? "amber" : "blue"} active={amber || active} size="sm" />
        <span className="flex-1 min-w-0 truncate">{children}</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums leading-none bg-gray-200/80 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          {count}
        </span>
      </a>
    </li>
  );
}

export function CrewSelector({ teams = [], unassignedCount = 0, onNavigate }: {
  teams?: TeamSummary[];
  unassignedCount?: number;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const onDashboard = location.pathname === "/app/dashboard";
  // "Unassigned" is active via the dashboard's remaining ?team=unassigned
  // filter; a crew is active on its own page.
  const unassignedActive = onDashboard && new URLSearchParams(location.search).get("team") === "unassigned";

  return (
    <nav aria-label="Crews" className="mt-6">
      <p className="px-3 pt-1 pb-2 text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500">
        Crews
      </p>
      <ul className="flex flex-col gap-1">
        {teams.map((team) => (
          <CrewRow
            key={team.id}
            href={`/app/crews/${team.id}`}
            active={location.pathname === `/app/crews/${team.id}`}
            count={team.board_count}
            onNavigate={onNavigate}
          >
            {team.name}
          </CrewRow>
        ))}
        {unassignedCount > 0 && (
          <CrewRow
            href="/app/dashboard?team=unassigned"
            active={unassignedActive}
            amber
            count={unassignedCount}
            onNavigate={onNavigate}
          >
            Unassigned
          </CrewRow>
        )}
      </ul>
    </nav>
  );
}

export default function Sidebar({ isAdmin, teams, unassignedCount, onNavigate, className = "" }: SidebarProps) {
  const location = useLocation();
  const items = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className={className}>
      <nav aria-label="Main">
        <p className="px-3 pt-1 pb-2 text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 dark:text-gray-500">
          Mission Control
        </p>
        <ul className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => {
            // Crew detail pages (/app/crews/:id) are highlighted in the Crews
            // section below, not here — Mission Control's "Crews" row is only
            // active on the index itself.
            const active =
              href === "/app/crews"
                ? location.pathname === href
                : location.pathname === href || location.pathname.startsWith(`${href}/`);

            return (
              <li key={href}>
                <a
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={rowClasses(active)}
                >
                  <Icon size="md" />
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <CrewSelector teams={teams} unassignedCount={unassignedCount} onNavigate={onNavigate} />
    </div>
  );
}

// app/routes/app/crews.tsx
// Teams index (issue #72): list the caller's teams, create a new team.

export const meta = () => [{ title: "Crews – Retrograde" }];

import { useEffect, useRef } from "react";
import { Form, redirect, useLoaderData, useNavigate, useFetcher, type ActionFunctionArgs } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { createTeam, listTeamsForUser, type TeamSummary } from "~/server/team_model";
import { accountCanCreateNamedCrew } from "~/server/entitlements";
import { StatusLED } from "~/components/StatusLED";

export async function loader({ request }: { request: Request }) {
  const user = await requireRegisteredUser(request);
  const teams = await listTeamsForUser(user.id);
  return { teams };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireRegisteredUser(request);
  const form = await request.formData();

  if (form.get("intent") === "create") {
    const name = form.get("name")?.toString().trim();
    if (!name) return { error: "Crew name is required." };
    if (name.length > 100) return { error: "Crew name is too long (max 100 chars)." };
    if (!(await accountCanCreateNamedCrew(user.id))) {
      throw new Response("A named crew requires a paid plan", { status: 403 });
    }
    const teamId = await createTeam(name, user.id);
    return redirect(`/app/crews/${teamId}`);
  }

  throw new Response("Bad Request", { status: 400 });
}

function TeamCard({ team, onOpen }: { team: TeamSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left border rounded-2xl p-5 bg-white dark:bg-gray-900
        border-gray-200 dark:border-gray-700/60
        hover:border-blue-400 dark:hover:border-blue-500/60
        hover:shadow-lg hover:shadow-blue-500/10 transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold truncate">{team.name}</h2>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <StatusLED color="blue" active size="sm" />
          {team.member_count} member{team.member_count !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <StatusLED color="green" active={team.board_count > 0} size="sm" />
          {team.board_count} board{team.board_count !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <StatusLED color="amber" active={team.open_action_items > 0} size="sm" />
          {team.open_action_items} open action item{team.open_action_items !== 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}

export default function TeamsPage() {
  const { teams } = useLoaderData<typeof loader>() as { teams: TeamSummary[] };
  const navigate = useNavigate();
  const createFetcher = useFetcher<{ error?: string }>();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (createFetcher.state === "idle" && !createFetcher.data?.error) formRef.current?.reset();
  }, [createFetcher.state, createFetcher.data]);

  return (
    <div className="px-8 mx-auto w-full sm:w-[80%] max-w-5xl">
      <h1 className="text-3xl font-semibold mb-1">Crews</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Organize boards under crews, share them with your crewmates, and track
        crew-level action items. Crew boards are permanent and visible to every member.
      </p>

      <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 dark:text-gray-500 mb-3">
        Your Crews
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {teams.map((team) => (
          <TeamCard key={team.id} team={team} onOpen={() => navigate(`/app/crews/${team.id}`)} />
        ))}
      </div>

      <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 dark:text-gray-500 mb-3">
        Assemble a New Crew
      </p>
      <createFetcher.Form ref={formRef} method="post" className="flex gap-2 items-start flex-wrap">
        <input type="hidden" name="intent" value="create" />
        <div className="flex flex-col gap-1 flex-1 min-w-[16rem]">
          <input
            type="text"
            name="name"
            placeholder="Crew name"
            required
            maxLength={100}
            className="border rounded px-3 py-1.5 border-blue-400 dark:border-blue-800 bg-blue-50 dark:bg-blue-950"
          />
          {createFetcher.data?.error && (
            <p className="text-sm text-red-500">{createFetcher.data.error}</p>
          )}
        </div>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm cursor-pointer"
        >
          Create Crew
        </button>
      </createFetcher.Form>
    </div>
  );
}

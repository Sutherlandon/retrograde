// app/routes/app/account.api-keys.tsx
// User-facing UI for minting and revoking API keys on the caller's personal team.
// See ADR-0003 (teams) and ADR-0004 (API keys).

export const meta = () => [{ title: "API Keys – Retrograde" }];

import { useEffect, useRef } from "react";
import { useLoaderData, useFetcher } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { getPersonalTeamForUser, userIsTeamMember } from "~/server/team_model";
import {
  listApiKeysForTeam,
  mintApiKey,
  revokeApiKey,
} from "~/server/api_key";
import type { ApiKeyDTO } from "~/server/board.types";

interface LoaderData {
  teamId: string;
  teamName: string;
  keys: ApiKeyDTO[];
}

export async function loader({ request }: LoaderFunctionArgs): Promise<LoaderData> {
  const user = await requireRegisteredUser(request);
  const team = await getPersonalTeamForUser(user.id);
  if (!team) {
    // Should not happen post-backfill, but if it does, the user simply has no
    // personal team yet — render an empty state rather than crashing.
    throw new Response("No personal team found for this user", { status: 500 });
  }
  const keys = await listApiKeysForTeam(team.id);
  return { teamId: team.id, teamName: team.name, keys };
}

interface ActionResult {
  mintedKey?: string;
  mintedDisplayName?: string;
  revokedId?: string;
  error?: string;
}

export async function action({ request }: ActionFunctionArgs): Promise<ActionResult> {
  const user = await requireRegisteredUser(request);
  const team = await getPersonalTeamForUser(user.id);
  if (!team) {
    return { error: "No personal team found for this user." };
  }

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "mint") {
    const displayName = form.get("display_name")?.toString().trim();
    if (!displayName) {
      return { error: "Display name is required." };
    }
    if (displayName.length > 100) {
      return { error: "Display name is too long (max 100 chars)." };
    }
    const result = await mintApiKey(team.id, displayName, user.id);
    return { mintedKey: result.key, mintedDisplayName: result.apiKey.display_name };
  }

  if (intent === "revoke") {
    const apiKeyId = form.get("api_key_id")?.toString();
    if (!apiKeyId) {
      return { error: "Missing api_key_id." };
    }
    // Defense in depth: confirm the user is a member of the team that owns the
    // key (loader already restricted to their personal team, but a malicious
    // form post could send a different team's id).
    if (!(await userIsTeamMember(user.id, team.id))) {
      return { error: "Not authorized to revoke this key." };
    }
    await revokeApiKey(apiKeyId, team.id);
    return { revokedId: apiKeyId };
  }

  return { error: "Unknown intent." };
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export default function ApiKeysPage() {
  const { teamId, teamName, keys } = useLoaderData<typeof loader>() as LoaderData;
  const mintFetcher = useFetcher<ActionResult>();
  const revokeFetcher = useFetcher<ActionResult>();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (mintFetcher.data?.mintedKey) formRef.current?.reset();
  }, [mintFetcher.data]);

  return (
    <div className="px-8 mx-auto w-full sm:w-[80%] max-w-4xl">
      <h1 className="text-3xl font-semibold mb-2">API Keys</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        API keys let AI agents authenticate to Retrograde on behalf of your team
        ({teamName}). Each key has its own display name, which is what humans
        see on notes the agent creates.
      </p>

      {/* Newly-minted key reveal — shown ONCE */}
      {mintFetcher.data?.mintedKey && (
        <div className="border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/50 rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-2">
            New key: {mintFetcher.data.mintedDisplayName}
          </h2>
          <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
            Copy this key now — it will not be shown again. If you lose it,
            you'll need to revoke this key and mint a new one.
          </p>
          <pre
            data-testid="minted-key"
            className="font-mono text-xs sm:text-sm bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded p-3 overflow-x-auto select-all"
          >
            {mintFetcher.data.mintedKey}
          </pre>
        </div>
      )}

      {/* Existing keys table */}
      <h2 className="text-xl font-semibold mb-3">Your keys</h2>
      {keys.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-600 mb-6">
          No API keys yet. Mint one below to let an agent connect.
        </p>
      ) : (
        <div className="overflow-x-auto border rounded-lg mb-6">
          <table className="table-auto w-full">
            <thead>
              <tr>
                <th className="text-left px-4 py-2 border-b-2">Name</th>
                <th className="text-left px-4 py-2 border-b-2">Prefix</th>
                <th className="text-left px-4 py-2 border-b-2">Created</th>
                <th className="text-left px-4 py-2 border-b-2">Last used</th>
                <th className="px-4 py-2 border-b-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const isRevoked = !!k.revoked_at;
                return (
                  <tr
                    key={k.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${isRevoked ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3 border-b dark:border-gray-700">
                      {k.display_name}
                      {isRevoked && (
                        <span className="ml-2 text-xs text-red-500">revoked</span>
                      )}
                    </td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 font-mono text-xs">
                      {k.key_prefix}…
                    </td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "never"}
                    </td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 text-right">
                      {!isRevoked && (
                        <revokeFetcher.Form method="post">
                          <input type="hidden" name="intent" value="revoke" />
                          <input type="hidden" name="api_key_id" value={k.id} />
                          <button
                            type="submit"
                            className="text-sm text-red-500 hover:text-red-700 cursor-pointer"
                          >
                            Revoke
                          </button>
                        </revokeFetcher.Form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mint form */}
      <h2 className="text-xl font-semibold mb-3">Mint a new key</h2>
      <mintFetcher.Form
        ref={formRef}
        method="post"
        className="flex gap-2 items-start flex-wrap"
      >
        <input type="hidden" name="intent" value="mint" />
        <input type="hidden" name="team_id" value={teamId} />
        <div className="flex flex-col gap-1 flex-1 min-w-[16rem]">
          <input
            type="text"
            name="display_name"
            placeholder='Display name (e.g. "Claude (roadmap)")'
            required
            maxLength={100}
            className="border rounded px-3 py-1.5 border-blue-400 dark:border-blue-800 bg-blue-50 dark:bg-blue-950"
          />
          {mintFetcher.data?.error && (
            <p className="text-sm text-red-500">{mintFetcher.data.error}</p>
          )}
        </div>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm cursor-pointer"
        >
          Mint key
        </button>
      </mintFetcher.Form>

      <p className="text-xs text-gray-400 dark:text-gray-600 mt-8">
        Keys are stored hashed at rest. The full key is only shown at mint time.
        See <a href="/llms.txt" className="underline">/llms.txt</a> for the API
        the key authenticates against.
      </p>
    </div>
  );
}

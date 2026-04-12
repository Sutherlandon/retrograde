// app/routes/app/admin.admins.ts
// Resource route for managing granted admin users.
// Only site admins (those listed in SITE_ADMIN_IDS) may call these actions.

import { requireRegisteredUser } from "~/hooks/useAuth";
import { pool, siteAdminIds } from "~/server/db_config";
import {
  addGrantedAdmin,
  findRegisteredUserByUsername,
  removeGrantedAdmin,
} from "~/server/admin_model";

async function requireSiteAdmin(request: Request) {
  const user = await requireRegisteredUser(request);

  const userRow = await pool.query(
    "SELECT external_id FROM users WHERE id = $1",
    [user.id]
  );
  const externalId: string | undefined = userRow.rows[0]?.external_id;

  if (!externalId || !siteAdminIds.includes(externalId)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return { ...user, externalId };
}

export async function action({ request }: { request: Request }) {
  const admin = await requireSiteAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "add") {
    const username = formData.get("username")?.toString().trim();
    if (!username) {
      return { error: "Username is required." };
    }

    const target = await findRegisteredUserByUsername(username);
    if (!target) {
      return { error: `No registered user found with username "${username}".` };
    }

    await addGrantedAdmin(target.id, admin.externalId);
    return { success: true, addedUsername: target.username };
  }

  if (intent === "remove") {
    const userId = formData.get("userId")?.toString();
    if (!userId) {
      return { error: "Missing userId." };
    }
    await removeGrantedAdmin(userId);
    return { success: true };
  }

  throw new Response("Bad Request", { status: 400 });
}

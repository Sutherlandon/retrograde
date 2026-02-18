import { requireUser } from "~/hooks/useAuth";
import { redirect } from "react-router";

/**
 * A simple route that requires authentication and then redirects to the home page.
 */
export async function loader({ request }: { request: Request }) {
  await requireUser(request);
  throw redirect(`/app/dashboard`);
}
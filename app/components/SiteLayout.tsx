/**
 * Layout for the website pages — authentication is optional.
 * If a user is logged in, their profile is shown in the header. The website
 * exists only on the hosted service: on a self-hosted instance every site page
 * is one of this layout's children, so this one redirect keeps all of them
 * from rendering and makes the dashboard home (ADR-0017).
 */
import { useLoaderData, Outlet, redirect } from "react-router";
import { getOptionalUser } from "~/hooks/useAuth";
import { hostingConfig, selfHosted } from "~/server/db_config";
import { UserProvider } from "~/context/userContext";
import Header from "./Header";
import Footer from "./Footer";

export async function loader({ request }: { request: Request }) {
  if (selfHosted) return redirect("/app/dashboard");
  const user = await getOptionalUser(request);
  return { user, hosting: hostingConfig };
}

export default function SiteLayout() {
  const { user, hosting } = useLoaderData();

  return (
    <UserProvider user={user}>
      {/* Every site page is drawn on the night sky; the night ground runs from
          header to footer so a short page leaves no gap. */}
      <div className="min-h-screen flex flex-col bg-night-950">
        <Header user={user} hosting={hosting} night />
        <main className="flex-grow bg-night-950">
          <Outlet />
        </main>
        <Footer />
      </div>
    </UserProvider>
  );
}
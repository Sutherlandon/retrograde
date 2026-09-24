import { redirect, useActionData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { createBoard } from "~/server/board_model";
import { getOrCreateUser } from "~/hooks/useAuth";
import { commitSession } from "~/session.server";
import retrogradeSnapshot from "~/images/retrograde-snapshot.png";
import Horizon from "~/components/landing/Horizon";
import SkyFade from "~/components/landing/SkyFade";
import CreateBoardForm, { type CreateBoardErrors } from "~/components/landing/CreateBoardForm";
import CreateBoardLink from "~/components/landing/CreateBoardLink";
import { HowItWorks, IdeaBoards, WhatsNew, SectionIntro } from "~/components/landing/LandingFeatures";
import { Pricing, Faq } from "~/components/landing/LandingPricing";
import { selfHosted } from "~/server/db_config";

// Link previews fetch og:image from whichever deployment served the page, so
// staging previews staging's card before it ships. Search engines still treat
// production as the real page (canonical).
export async function loader({ request }: LoaderFunctionArgs) {
  return { origin: new URL(request.url).origin };
}

export const meta = ({ data }: { data?: { origin: string } }) => {
  const origin = data?.origin ?? "https://retrograde.sh";
  return [
    { title: "Retrograde – Retrospective Boards for Teams and Their AI Agents" },
    {
      name: "description",
      content:
        "Run retrospectives your whole crew shows up for. Free boards in seconds for retros and brainstorming, crews for your team, action items that carry into the next sprint, and AI agents that join the board from a shared link.",
    },
    { name: "keywords", content: "agile retrospective tool, scrum retrospectives, retro board, idea board, brainstorming with AI agents, AI agent retrospective, team action items, sprint review" },
    { name: "robots", content: "index, follow" },
    { property: "og:title", content: "Retrograde – Mission Control for Retrospectives" },
    {
      property: "og:description",
      content: "Retros for your whole crew — people and AI agents on one board. Start free in seconds.",
    },
    { property: "og:type", content: "website" },
    { property: "og:url", content: `${origin}/` },
    // Captured from /og-card, which renders this image's source at 1200×630.
    { property: "og:image", content: `${origin}/og-image.png` },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    {
      property: "og:image:alt",
      content: "Retrograde: Retros your whole crew shows up for. People and Agents. Set over a starry night sky and mountain ridge.",
    },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Retrograde – Mission Control for Retrospectives" },
    {
      name: "twitter:description",
      content: "Retros for your whole crew — people and AI agents on one board. Start free in seconds.",
    },
    { tagName: "link", rel: "canonical", href: "https://retrograde.sh" },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  // A self-hosted instance serves no marketing site (ADR-0017) and has no
  // guests (ADR-0021), so this board form does not exist there.
  if (selfHosted) return redirect("/app/dashboard");

  const formData = await request.formData();
  const title = formData.get("title")?.toString().trim();
  const no_jerks = formData.get("no_jerks");
  const errors: Record<string, string> = {};

  // validate the form data
  if (!title || title.length < 3) {
    errors.title = "Title must be at least 3 characters.";
  }

  // check if they agreed to the kindness checkbox
  if (!no_jerks) {
    errors.no_jerks = "You must agree to the kindness checkbox.";
  }

  // return any validation errors
  if (Object.keys(errors).length > 0) {
    return Response.json({ errors }, { status: 400 });
  }

  // Honeypot: bots fill hidden fields, humans don't. Silently redirect to
  // avoid tipping off bots that they were caught.
  const honeypot = formData.get("website")?.toString();
  if (honeypot) {
    return redirect(`/app/board/example-board`);
  }

  // create the board first — crewless (tier 1), so no owner (GAP-002 /
  // ADR-0011). It stays ownerless and open to everyone until claimed.
  const board_id = await createBoard(title!);

  // ensure the visitor has an identity (creates an anonymous user if needed)
  const { session, isNew } = await getOrCreateUser(request, board_id);

  // redirect with session cookie if a new anonymous user was created
  const headers: HeadersInit = {};
  if (isNew) {
    headers["Set-Cookie"] = await commitSession(session);
  }
  return redirect(`/app/board/${board_id}`, { headers });
}

export default function Home() {
  const actionData = useActionData<{ errors?: CreateBoardErrors }>();

  return (
    <div className="min-w-[380px] overflow-x-clip bg-night-950 text-slate-300">
      <Hero errors={actionData?.errors} />
      <HowItWorks />
      <Snapshot />
      <IdeaBoards />
      <WhatsNew />
      <Pricing />
      <Faq />
      <FinalCta />
    </div>
  );
}

// A few brighter stars that breathe on top of the tiled starfield.
const TWINKLES = [
  "top-[12%] left-[8%]", "top-[22%] left-[46%]", "top-[9%] right-[18%]",
  "top-[38%] right-[6%]", "top-[52%] left-[30%]", "top-[30%] left-[70%]",
];

function Hero({ errors }: { errors?: CreateBoardErrors }) {
  return (
    <section className="night-sky relative overflow-hidden">
      {/* The header is a solid band; the sky comes up out of it. */}
      <SkyFade className="h-40" />
      {TWINKLES.map((pos, i) => (
        <span
          key={pos}
          aria-hidden="true"
          style={{ animationDelay: `${i * 0.7}s` }}
          className={`absolute ${pos} h-1 w-1 rounded-full bg-white shadow-[0_0_8px_2px_rgb(156_192_255/0.6)] animate-[twinkle_4s_ease-in-out_infinite] motion-reduce:animate-none`}
        />
      ))}
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-40 md:grid-cols-[1.3fr_1fr] md:pt-24 md:pb-56">
        <div>
          <h1 className="py-0 mb-6 text-4xl leading-[1.1] tracking-tight text-white md:text-5xl xl:text-6xl">
            Retros your whole crew shows up for.{" "}
            <span className="bg-gradient-to-r from-stardust-100 via-airglow-300 to-starlight-300 bg-clip-text text-transparent">
              People and Agents.
            </span>
          </h1>
          <p className="mb-0 max-w-xl text-lg text-slate-300 md:text-xl">
            Collect every insight, vote on what matters, and carry action items into the next sprint.
            Bring your team into a crew, and let your AI agents prep the board and read the results back.
          </p>
        </div>
        <CreateBoardForm errors={errors} />
      </div>
      <Horizon className="absolute inset-x-0 bottom-0 h-40 md:h-56" />
    </section>
  );
}

function Snapshot() {
  return (
    <section aria-labelledby="snapshot-heading" className="mx-auto max-w-6xl px-4 py-24">
      <SectionIntro
        eyebrow="On the board"
        id="snapshot-heading"
        title="Every voice on the board, not just the loudest"
        text="Anonymous by default, so the quiet half of the room speaks up too."
      />
      <div className="relative mx-auto max-w-5xl">
        <div className="absolute inset-x-10 -bottom-10 h-40 rounded-full bg-airglow-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative rounded-2xl border border-white/10 bg-night-800 p-2 glow-starlight">
          <img
            src={retrogradeSnapshot}
            alt="A Retrograde board with columns of sticky notes and votes"
            className="h-auto w-full rounded-xl"
          />
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="night-sky relative overflow-hidden">
      {/* The page above ends on dark ground; the sky comes up out of it. */}
      <SkyFade className="h-72" />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pt-40 pb-44 text-center">
        <h2 className="py-0 mb-4 text-3xl tracking-tight text-white md:text-5xl">Your next retro starts here.</h2>
        <p className="mb-10 text-lg text-slate-300">One board, one link, ten seconds. Your crew will do the rest.</p>
        <CreateBoardLink />
      </div>
      <Horizon className="absolute inset-x-0 bottom-0 h-32" />
    </section>
  );
}

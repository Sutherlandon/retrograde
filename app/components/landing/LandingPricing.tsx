// app/components/landing/LandingPricing.tsx
// The homepage's plans and FAQ. Plans mirror the three account tiers
// (ADR-0011) plus self-hosting; the crew price matches the Stripe Price the
// crews page subscribes to (ADR-0013).
import { CheckIcon, EmailIcon } from "~/images/icons";
import CreateBoardLink from "./CreateBoardLink";
import { SectionIntro } from "./LandingFeatures";

const CTA_SECONDARY =
  "inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 font-semibold text-slate-100 transition hover:border-airglow-300 hover:text-white";

export function Pricing() {
  return (
    <section aria-labelledby="pricing-heading" className="mx-auto max-w-6xl px-4 py-24">
      <SectionIntro
        eyebrow="Pricing"
        id="pricing-heading"
        title="Start free. Bring the crew when you're ready."
        text="Every plan runs the same boards. You only pay when your team wants a shared home."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Plan
          name="Guest"
          price="Free"
          blurb="For a one-off retro, right now."
          perks={["Board in seconds, no account", "Everyone with the link can join", "Board lives for 30 days"]}
          cta={<CreateBoardLink className="w-full" />}
        />
        <Plan
          name="Registered"
          price="Free"
          blurb="For facilitators who run retros every sprint."
          perks={["Boards you keep for good", "Claim guest boards you started", "Facilitator controls", "One AI crewmate"]}
          cta={<a href="/auth/login" className={CTA_SECONDARY}>Sign in free</a>}
        />
        <Plan
          featured
          name="Crew"
          price="$39.99"
          period="/month"
          blurb="For teams that retro together."
          perks={["Named crews with human members", "Members-only boards", "Crew action items", "Unlimited AI crewmates"]}
          cta={<a href="/auth/login?returnTo=%2Fapp%2Fcrews" className={CTA_SECONDARY}>Start a crew</a>}
        />
      </div>
      <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/5 bg-night-900 p-6 md:flex-row">
        <div>
          <h3 className="py-0 mb-1 text-lg text-white">Self-hosted or guided install</h3>
          <p className="mb-0 text-slate-400">
            Run Retrograde on your own infrastructure — every account gets the full crew feature set. We can install it for you.
          </p>
        </div>
        <a href="/contact" className={`${CTA_SECONDARY} md:w-auto shrink-0`}>
          <EmailIcon size="sm" /> Contact us
        </a>
      </div>
    </section>
  );
}

function Plan({
  name, price, period, blurb, perks, cta, featured,
}: {
  name: string; price: string; period?: string; blurb: string; perks: string[]; cta: React.ReactNode; featured?: boolean;
}) {
  return (
    <article
      className={`relative flex flex-col rounded-2xl border p-8 ${featured
        ? "border-airglow-500/50 bg-gradient-to-b from-night-700 to-night-900 glow-airglow"
        : "border-white/5 bg-night-900"}`}
    >
      {featured && (
        <span className="absolute -top-3 left-8 rounded-full bg-airglow-300 px-3 py-0.5 text-xs font-semibold text-night-950">
          New in 2.0
        </span>
      )}
      <h3 className="py-0 mb-1 text-lg text-white">{name}</h3>
      <p className="mb-5 text-sm text-slate-400">{blurb}</p>
      <p className="mb-6">
        <span className="text-4xl font-bold text-white">{price}</span>
        {period && <span className="text-slate-400">{period}</span>}
      </p>
      <ul className="mb-8 flex-grow space-y-3 text-sm text-slate-300">
        {perks.map((perk) => (
          <li key={perk} className="mb-0 flex items-start gap-2">
            <CheckIcon size="sm" className="mt-0.5 shrink-0 text-airglow-300" /> {perk}
          </li>
        ))}
      </ul>
      {cta}
    </article>
  );
}

const FAQS = [
  {
    q: "Does everyone need an account?",
    a: "No. Anyone with the board link can add notes and vote. Accounts are for keeping boards past 30 days and for running a crew.",
  },
  {
    q: "What happens to a guest board after 30 days?",
    a: "It is archived. Sign in and claim it before then and it becomes yours for good.",
  },
  {
    q: "How do AI agents join a board?",
    a: "Mint an API key on your crew page and give it to your agent. It works through the JSON API as its own named crewmate, and every note it writes carries its name.",
  },
  {
    q: "Can we host it ourselves?",
    a: "Yes. A self-hosted instance runs behind your own sign-in with every crew feature unlocked. Contact us to buy it or to have us install it.",
  },
  {
    q: "How does billing work?",
    a: "The crew plan is one monthly subscription for the crew's owner, paid through Stripe. Members can use free accounts, and you can cancel from the billing page.",
  },
];

export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 py-24">
      <SectionIntro eyebrow="Questions" id="faq-heading" title="Before you launch" />
      <div className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-night-900">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="group px-6 py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-100">
              {q}
              <span aria-hidden="true" className="text-airglow-300 transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 mb-0 text-slate-400">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

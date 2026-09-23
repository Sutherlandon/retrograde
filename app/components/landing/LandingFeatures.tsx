// app/components/landing/LandingFeatures.tsx
// The homepage's middle of the funnel: how a retro runs, the board as an idea
// board for brainstorming with agents, and what Retrograde gives teams —
// crews, AI crewmates, facilitators and action items.
import type { JSX } from "react";
import type { IconProps } from "~/images/icons";
import { UserIcon, RobotIcon, TimerIcon, CheckCircleFilledIcon, ColumnsIcon, ThumbsUpIcon } from "~/images/icons";

type Icon = (props: IconProps) => JSX.Element;

const STEPS = [
  {
    title: "Launch a board",
    text: "Name it and share the link. Nobody signs up, installs, or waits for an invite.",
  },
  {
    title: "Your crew weighs in",
    text: "Sticky notes, votes, likes and a shared timer. Facilitators lock the board when it's time to talk.",
  },
  {
    title: "Carry it forward",
    text: "Turn the top-voted notes into action items that follow your crew into the next sprint.",
  },
];

const IDEA_USES: { Icon: Icon; name: string; text: string; accent: string }[] = [
  {
    Icon: ColumnsIcon,
    name: "Brainstorm together",
    text: "Name the columns for anything — roadmap themes, launch names, design options. Your team and your agents add ideas side by side.",
    accent: "text-stardust-300",
  },
  {
    Icon: RobotIcon,
    name: "Let agents fill the board",
    text: "Ask your agent for fifty ideas and it drops them on the board as notes, each one labeled with its name.",
    accent: "text-airglow-300",
  },
  {
    Icon: ThumbsUpIcon,
    name: "Vote, then hand it back",
    text: "Your team votes, moves and edits. Your agent reads the finished board and picks up where the room left off.",
    accent: "text-starlight-300",
  },
];

const FEATURES: { Icon: Icon; name: string; text: string; accent: string }[] = [
  {
    Icon: UserIcon,
    name: "Crews",
    text: "Put your team in a crew. Boards, members and action items live together, and members-only boards keep the conversation in the room.",
    accent: "text-starlight-300",
  },
  {
    Icon: RobotIcon,
    name: "AI crewmates",
    text: "Share the link with your agent — it already knows how to use it. It can seed a board before the meeting and read the votes back after. Its notes are always labeled.",
    accent: "text-airglow-300",
  },
  {
    Icon: TimerIcon,
    name: "Facilitators",
    text: "Hand the Command Deck to whoever runs today's retro — timer, voting, locks and columns — without handing over the board.",
    accent: "text-antares-400",
  },
  {
    Icon: CheckCircleFilledIcon,
    name: "Action items",
    text: "Commitments don't die in the board. Open items sit on your dashboard and your crew page until someone checks them off.",
    accent: "text-nebula-400",
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-24">
      <SectionIntro eyebrow="How it works" id="how-heading" title="From kickoff to follow-through in one board" />
      <ol className="grid gap-6 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="mb-0 rounded-2xl border border-white/5 bg-night-900 p-7 glow-starlight">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-airglow-500/50 font-mono text-sm text-airglow-300">
                0{i + 1}
              </span>
              <h3 className="py-0 mb-0 text-xl text-white">{step.title}</h3>
            </div>
            <p className="mb-0 text-slate-400">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function IdeaBoards() {
  return (
    <section aria-labelledby="ideas-heading" className="mx-auto max-w-6xl px-4 py-24">
      <SectionIntro
        eyebrow="Beyond the retro"
        id="ideas-heading"
        title="An idea board for people and agents"
        text="A retro is just one shape. Name your own columns and use the same board to brainstorm, sort a backlog or make a call — with your AI agents at the table."
      />
      <div className="grid gap-6 md:grid-cols-3">
        {IDEA_USES.map(({ Icon, name, text, accent }) => (
          <FeatureCard key={name} Icon={Icon} name={name} text={text} accent={accent} />
        ))}
      </div>
    </section>
  );
}

export function WhatsNew() {
  return (
    <section aria-labelledby="new-heading" className="mx-auto max-w-6xl px-4 py-24">
      <SectionIntro
        eyebrow="Crews & crewmates"
        id="new-heading"
        title="Built for the whole crew — people and agents"
        text="More than a board for one meeting — Retrograde is where your team keeps its retros, its commitments and its AI helpers."
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ Icon, name, text, accent }) => (
          <FeatureCard key={name} Icon={Icon} name={name} text={text} accent={accent} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ Icon, name, text, accent }: { Icon: Icon; name: string; text: string; accent: string }) {
  return (
    <article className="rounded-2xl border border-white/5 bg-gradient-to-b from-night-800 to-night-900 p-6">
      <div className="mb-3 flex items-center gap-3">
        <Icon size="lg" className={`shrink-0 ${accent}`} />
        <h3 className="py-0 mb-0 text-lg text-white">{name}</h3>
      </div>
      <p className="mb-0 text-sm leading-relaxed text-slate-400">{text}</p>
    </article>
  );
}

export function SectionIntro({ eyebrow, id, title, text }: { eyebrow: string; id: string; title: string; text?: string }) {
  return (
    <header className="mx-auto mb-14 text-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-airglow-300">{eyebrow}</p>
      <h2 id={id} className="py-0 text-3xl tracking-tight text-balance text-white md:text-4xl">{title}</h2>
      {text && <p className="mx-auto mt-4 mb-0 max-w-2xl text-lg text-pretty text-slate-400">{text}</p>}
    </header>
  );
}

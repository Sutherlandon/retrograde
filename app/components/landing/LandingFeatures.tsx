// app/components/landing/LandingFeatures.tsx
// The homepage's middle of the funnel: how a retro runs, and what 2.0 adds
// for teams — crews, AI crewmates, facilitators and action items.
import type { JSX } from "react";
import type { IconProps } from "~/images/icons";
import { RocketIcon, UserIcon, RobotIcon, TimerIcon, FlagIcon, CheckIcon } from "~/images/icons";

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
    text: "Mint an API key and your agent joins as a named crewmate. It can seed a board before the meeting and read the votes back after. Its notes are always labeled.",
    accent: "text-airglow-300",
  },
  {
    Icon: TimerIcon,
    name: "Facilitators",
    text: "Hand the Command Deck to whoever runs today's retro — timer, voting, locks and columns — without handing over the board.",
    accent: "text-antares-400",
  },
  {
    Icon: FlagIcon,
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
            <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-airglow-500/50 font-mono text-sm text-airglow-300">
              0{i + 1}
            </span>
            <h3 className="py-0 mb-2 text-xl text-white">{step.title}</h3>
            <p className="mb-0 text-slate-400">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function WhatsNew() {
  return (
    <section aria-labelledby="new-heading" className="mx-auto max-w-6xl px-4 py-24">
      <SectionIntro
        eyebrow="New in 2.0"
        id="new-heading"
        title="Built for the whole crew — people and agents"
        text="Retrograde started as a quick board for a single retro. 2.0 makes it where your team keeps its retros, its commitments and its AI helpers."
      />
      <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURES.map(({ Icon, name, text, accent }) => (
            <article key={name} className="rounded-2xl border border-white/5 bg-gradient-to-b from-night-800 to-night-900 p-6">
              <Icon size="lg" className={`mb-4 ${accent}`} />
              <h3 className="py-0 mb-2 text-lg text-white">{name}</h3>
              <p className="mb-0 text-sm leading-relaxed text-slate-400">{text}</p>
            </article>
          ))}
        </div>
        <AgentBoardPreview />
      </div>
    </section>
  );
}

// A stylized slice of a board: a human note and an agent note side by side,
// showing that agent contributions always carry their attribution.
function AgentBoardPreview() {
  return (
    <figure aria-label="A board with notes from a teammate and an AI crewmate" className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-8 rounded-full bg-airglow-500/15 blur-3xl" aria-hidden="true" />
      <div className="relative rounded-2xl border border-white/10 bg-night-800/80 p-5 backdrop-blur glow-starlight">
        <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
          <span>What went well</span>
          <RocketIcon size="sm" className="text-airglow-300" />
        </div>
        <PreviewNote author="Maya" votes={4} text="Pairing on the migration cut review time in half." />
        <PreviewNote
          agent
          author="Claude (sprint notes)"
          votes={3}
          text="12 of 14 stories closed; the two carried over were both blocked on the same API."
        />
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-airglow-500/30 bg-airglow-500/10 px-3 py-2 text-sm text-airglow-300">
          <CheckIcon size="sm" /> Action item: unblock the payments API before Sprint 43
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs text-slate-500">Agent notes are always attributed.</figcaption>
    </figure>
  );
}

function PreviewNote({ author, text, votes, agent }: { author: string; text: string; votes: number; agent?: boolean }) {
  return (
    <div className={`mb-3 rounded-lg p-4 shadow-lg shadow-black/40 ${agent ? "bg-stardust-100 text-night-900" : "bg-starlight-300 text-night-900"}`}>
      <p className="mb-3 text-sm font-medium">{text}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 font-semibold">
          {agent && <RobotIcon size="xs" />} {author}
        </span>
        <span className="rounded-full bg-night-900/10 px-2 py-0.5">+{votes}</span>
      </div>
    </div>
  );
}

export function SectionIntro({ eyebrow, id, title, text }: { eyebrow: string; id: string; title: string; text?: string }) {
  return (
    <header className="mx-auto mb-14 max-w-2xl text-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-airglow-300">{eyebrow}</p>
      <h2 id={id} className="py-0 text-3xl tracking-tight text-white md:text-4xl">{title}</h2>
      {text && <p className="mt-4 mb-0 text-lg text-slate-400">{text}</p>}
    </header>
  );
}

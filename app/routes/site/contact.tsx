// app/routes/site/contact.tsx
// How to reach the Retrograde team, on the marketing site's night sky.
import { useState } from "react";
import type { MetaFunction } from "react-router";
import PageHero from "~/components/landing/PageHero";
import { CopyIcon, EmailIcon } from "~/images/icons";


export const meta: MetaFunction = () => {
  return [
    { title: "Contact Retrograde | Questions, Feedback & Self-Hosting" },
    {
      name: "description",
      content:
        "Questions, feedback or a self-hosted install? Email the Retrograde team at hi@retrograde.sh. We read every message and reply quickly.",
    },
  ];
};

export default function ContactPage() {
  const [copied, setCopied] = useState(false);
  const email = "hi@retrograde.sh";

  const handleCopy = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-night-950 text-slate-300">
      <PageHero
        eyebrow="Contact"
        title="Get in touch"
        lede="We’d love to hear from you. Whether you have feedback, a question, or just want to start a conversation, don’t hesitate to reach out."
      />

      <div className="mx-auto max-w-2xl px-4 pt-12 pb-24 text-center">
        <div className="mb-12 rounded-2xl border border-white/10 bg-night-800/70 p-8 glow-airglow md:p-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-airglow-300">
            The best way to reach us is by email
          </p>
          <p className="mb-8 text-3xl font-semibold tracking-tight text-white md:text-4xl">hi@retrograde.sh</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={`mailto:${email}`}
              aria-label={`Email ${email}`}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-airglow-300 to-starlight-300 px-6 py-3 font-semibold text-night-950 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-airglow-300"
            >
              <EmailIcon size="md" /> Email
            </a>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy email address to clipboard"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-6 py-3 font-semibold text-slate-100 transition hover:border-white/30 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-airglow-300"
            >
              <CopyIcon size="md" /> Copy
            </button>
          </div>
          <p role="status" className="mt-4 mb-0 h-5 text-sm font-medium text-airglow-300">
            {copied ? "Copied to clipboard!" : ""}
          </p>
        </div>

        <p>
          We read every message and do our best to respond quickly and
          thoughtfully. Clear communication and fast follow-ups are important
          to us.
        </p>
        <p className="mb-0 text-slate-400">
          We’re based in Northern New Mexico and work with individuals and teams
          everywhere.
        </p>
      </div>
    </div>
  );
}

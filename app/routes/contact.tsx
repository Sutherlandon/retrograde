import { useState } from "react";
import type { MetaFunction } from "react-router";
import SiteLayout from "~/components/SiteLayout";
import Button from "~/components/Button";


export const meta: MetaFunction = () => {
  return [
    { title: "Contact Us | Sutherland On" },
    {
      name: "description",
      content:
        "Get in touch with Sutherland On. We'd love to hear your feedback, answer questions, and respond quickly to inquiries.",
    },
    {
      keywords: [
        "Sutherland On contact",
        "contact Sutherland On",
        "software consulting contact",
        "Northern New Mexico software",
        "get in touch",
      ],
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
    <SiteLayout>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1>Get in touch</h1>
        <p>
          We’d love to hear from you. Whether you have feedback, a question,
          or just want to start a conversation, don’t hesitate to reach out.
        </p>

        <p>
          We read every message and do our best to respond quickly and
          thoughtfully. Clear communication and fast follow-ups are important
          to us.
        </p>

        <p>The best way to reach us is by email:</p>

        <div className="flex items-center gap-3 flex-wrap mb-6">
          <div className="text-2xl rounded-lg rounded px-4 py-2 bg-slate-950">
            hi@retrograde.sh
          </div>

          <div className="flex items-center gap-3">
            <Button
              aria-label="Copy email address to clipboard"
              text="Email"
              as="a"
              href={`mailto:${email}`}
              variant="outline"
            />

            <Button
              onClick={handleCopy}
              aria-label="Copy email address to clipboard"
              variant="outline"
              text="Copy"
            />

            {copied && (
              <span className="text-sm font-medium text-green-600">
                Copied to clipboard!
              </span>
            )}
          </div>
        </div>

        <p>
          We’re based in Northern New Mexico and work with individuals and teams
          everywhere.
        </p>
      </main>
    </SiteLayout>
  );
}

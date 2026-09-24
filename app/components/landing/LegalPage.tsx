// app/components/landing/LegalPage.tsx
// Frame for the site's legal pages (Terms, Privacy): the night-sky page hero
// with the last-updated date, then the document styled for reading on the
// dark ground. The documents stay plain headings, paragraphs and lists.
import type { ReactNode } from "react";
import PageHero from "./PageHero";

const DOCUMENT = [
  "mx-auto max-w-3xl px-4 pt-12 pb-24 leading-relaxed text-slate-300",
  "[&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:py-0 [&_h2]:text-2xl [&_h2]:text-white",
  "[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:py-0 [&_h3]:text-lg [&_h3]:text-slate-100",
  "[&_strong]:text-slate-100 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-2",
  "[&_a]:text-starlight-300 [&_a]:underline [&_a]:decoration-starlight-300/30 [&_a]:underline-offset-4 [&_a:hover]:text-white",
].join(" ");

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <PageHero eyebrow="Legal" title={title} lede={`Last updated: ${updated}`} />
      <article className={DOCUMENT}>{children}</article>
    </>
  );
}

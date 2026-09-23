// app/routes/site/about.tsx
// Why Retrograde exists and who builds it, on the marketing site's night sky.
import PageHero from "~/components/landing/PageHero";

export const meta = () => [
  { title: "About Retrograde | Secure, Self-Hosted Retrospectives" },
  {
    name: "description",
    content:
      "Learn why Retrograde was built, its focus on secure on-site retrospectives, and the team behind it at Sutherlandon, LLC.",
  },
];

const LINK = "text-starlight-300 underline decoration-starlight-300/30 underline-offset-4 transition hover:text-white hover:decoration-white/50";

export default function AboutPage() {
  return (
    <div className="bg-night-950 text-slate-300">
      <PageHero eyebrow="About" title="About Retrograde" />

      <article className="mx-auto max-w-3xl px-4 pt-12 pb-24 text-lg leading-relaxed">
        <p className="text-xl text-slate-200">
          Retrograde began with a very specific requirement: we needed a
          retrospective tool that could run securely on-site, entirely within an
          internal network.
        </p>
        <p>
          At the time, most tools assumed cloud hosting and external data
          storage. That wasn’t acceptable for our situation — we needed something
          that could be deployed quickly in an internal environment, kept all
          data local, and stayed out of the way of the work itself.
        </p>
        <p className="mb-16">
          Designing for that constraint shaped everything that followed.
          Retrograde had to be simple, intuitive, and easy to stand up and
          support. What started as a secure, internal solution grew into a robust
          retrospective platform that teams can trust to facilitate meaningful
          reflection and continuous improvement — whether self-hosted or
          deployed in other environments.
        </p>

        <div className="grid gap-6 text-base md:grid-cols-2">
          <section className="rounded-2xl border border-white/5 bg-gradient-to-b from-night-800 to-night-900 p-7">
            <h2 className="py-0 mb-3 text-xl text-white">Who Built It</h2>
            <p>
              Retrograde is built and maintained by <strong className="text-slate-100">Sutherlandon, LLC</strong>,
              a small software company focused on building robust, useful tools that
              solve real problems. Our goal is always to deliver solutions that are
              easy to adopt and dependable over time.
            </p>
            <p className="mb-0">
              Learn more about our work at{" "}
              <a href="https://sutherlandon.com" className={LINK} target="_blank" rel="noopener noreferrer">
                sutherlandon.com
              </a>.
            </p>
          </section>

          <section className="rounded-2xl border border-white/5 bg-gradient-to-b from-night-800 to-night-900 p-7">
            <h2 className="py-0 mb-3 text-xl text-white">Release Notes</h2>
            <p className="mb-0">
              If you want to see what we've been up to,{" "}
              <a
                href="https://github.com/Sutherlandon/retrograde/releases"
                className={LINK}
                target="_blank"
                rel="noopener noreferrer"
              >
                check out the release notes here.
              </a>
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}

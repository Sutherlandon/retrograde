import SiteLayout from "~/components/SiteLayout";

export const metadata = () => ({
  title: "About Retrograde | Secure, Self-Hosted Retrospectives",
  description:
    "Learn why Retrograde was built, its focus on secure on-site retrospectives, and the team behind it at Sutherlandon, LLC.",
});

export default function AboutPage() {
  return (
    <SiteLayout>
      <section className="prose prose-neutral max-w-3xl mx-auto p-4">
        <h1>About Retrograde</h1>
        <p>
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
        <p>
          Designing for that constraint shaped everything that followed.
          Retrograde had to be simple, intuitive, and easy to stand up and
          support. What started as a secure, internal solution grew into a robust
          retrospective platform that teams can trust to facilitate meaningful
          reflection and continuous improvement — whether self-hosted or
          deployed in other environments.
        </p>

        <h2>Who Built It</h2>
        <p>
          Retrograde is built and maintained by <strong>Sutherlandon, LLC</strong>,
          a small software company focused on building robust, useful tools that
          solve real problems. Our goal is always to deliver solutions that are
          easy to adopt and dependable over time.
        </p>
        <p>
          Learn more about our work at{" "}
          <a
            href="https://sutherlandon.com"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            sutherlandon.com
          </a>.
        </p>
      </section>
    </SiteLayout>
  );
}

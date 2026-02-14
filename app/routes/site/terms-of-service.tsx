import type { MetaFunction } from "react-router";
import SiteLayout from "~/components/SiteLayout";

export const meta: MetaFunction = () => {
  return [
    { title: "Terms of Service | Retrograde" },
    {
      name: "description",
      content:
        "Retrograde Terms of Service. Learn the rules, acceptable use, and responsibilities for using the Retrograde team retrospective platform.",
    },
    { name: "robots", content: "index, follow" },
    { property: "og:title", content: "Terms of Service | Retrograde" },
    {
      property: "og:description",
      content:
        "The terms governing use of Retrograde, a simple and collaborative retrospective tool for teams.",
    },
    { property: "og:type", content: "website" },
  ];
};

export default function TermsOfService() {
  return (
    <SiteLayout>
      <main className="prose prose-neutral max-w-3xl mx-auto px-4 py-12">
        <h1>Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: 01/01/2026
        </p>

        <p>
          Welcome to <strong>Retrograde</strong>. By accessing or using this website
          or application, you agree to the following terms. If you do not agree,
          please do not use the service.
        </p>

        <h2>1. Be Respectful</h2>
        <p>
          This platform is designed for team collaboration. Treat others the way
          you want to be treated.
        </p>
        <p>
          Harassment, abuse, discrimination, threats, or harmful behavior of any
          kind are not allowed.
        </p>
        <p>
          We reserve the right to remove content or restrict access for behavior
          that violates this standard.
        </p>

        <h2>2. Your Content</h2>
        <p>
          You own the content you create. By using the service, you grant
          Retrograde a limited license to store and display your content as needed
          to operate the platform.
        </p>
        <p>
          You are responsible for ensuring your content does not violate laws,
          infringe on rights, or include sensitive data you do not have permission
          to share.
        </p>

        <h2>3. Acceptable Use</h2>
        <p>You may not use the service for the following activites:</p>
        <ul>
          <li>Disrupt or interfere with the service</li>
          <li>Attempt unauthorized access to systems or data</li>
          <li>Upload malicious code</li>
          <li>Use the service for illegal or harmful purposes</li>
        </ul>

        <h2>4. Service Availability</h2>
        <p>
          We aim to keep Retrograde reliable, but we do not guarantee uninterrupted
          or error-free operation.
        </p>

        <h2>5. Accounts</h2>
        <p>
          If accounts are used, you are responsible for keeping your credentials
          secure and for all activity under your account.
        </p>

        <h2>6. Privacy</h2>
        <p>
          We collect and use data only as described in our Privacy Policy.
        </p>

        <h2>7. Third-Party Services</h2>
        <p>
          Some features may rely on third-party services. We are not responsible
          for their content or availability.
        </p>

        <h2>8. Changes to These Terms</h2>
        <p>
          Continued use of Retrograde after changes means you accept the updated
          terms.
        </p>

        <h2>9. Contact</h2>
        <p>
          Questions? Email{" "}
          <a href="mailto:support@retrograde.sh">support@retrograde.sh</a>.
        </p>
      </main>
    </SiteLayout>
  );
}

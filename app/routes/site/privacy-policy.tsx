import type { MetaFunction } from "react-router";
import SiteLayout from "~/components/SiteLayout";

export const meta: MetaFunction = () => {
  return [
    { title: "Privacy Policy | Retrograde" },
    {
      name: "description",
      content:
        "Retrograde Privacy Policy. Learn how we collect, use, and protect your data when using the Retrograde retrospective platform.",
    },
    { name: "robots", content: "index, follow" },
    { property: "og:title", content: "Privacy Policy | Retrograde" },
    {
      property: "og:description",
      content:
        "How Retrograde handles data, privacy, and security for collaborative team retrospectives.",
    },
    { property: "og:type", content: "website" },
  ];
};

export default function PrivacyPolicy() {
  return (
    <SiteLayout>
      <main className="prose prose-neutral max-w-3xl mx-auto px-4 py-12">
        <h1>Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: 01/01/2026
        </p>

        <p>
          This Privacy Policy explains how <strong>Retrograde</strong> collects,
          uses, and protects your information.
        </p>

        <h2>1. Information We Collect</h2>

        <h3>Information You Provide</h3>
        <ul>
          <li>Notes, cards, comments, and board content</li>
          <li>Account information such as name and email</li>
          <li>Support communications</li>
        </ul>

        <h3>Automatically Collected Information</h3>
        <ul>
          <li>IP address</li>
          <li>Browser and device details</li>
          <li>Usage activity</li>
        </ul>

        <h3>Cookies &amp; Local Storage</h3>
        <p>
          We use cookies or local storage only for essential functionality and
          preferences. No advertising or tracking cookies.
        </p>

        <h2>2. How We Use Information</h2>
        <ul>
          <li>Operate and improve the service</li>
          <li>Provide support</li>
          <li>Ensure security and prevent misuse</li>
        </ul>

        <h2>3. Sharing Information</h2>
        <p>
          Data is shared only with trusted infrastructure providers when required
          to operate Retrograde or when legally required.
        </p>

        <h2>4. Data Retention</h2>
        <p>
          We retain data only as long as necessary. You may request deletion at any
          time.
        </p>

        <h2>5. Data Security</h2>
        <p>
          Reasonable safeguards are in place, but no system is perfectly secure.
        </p>

        <h2>6. Your Rights</h2>
        <p>
          You may request access, correction, deletion, or export of your data.
        </p>

        <h2>7. Children’s Privacy</h2>
        <p>
          Retrograde is not intended for children under 13.
        </p>

        <h2>8. Policy Changes</h2>
        <p>
          Continued use after updates indicates acceptance of the revised policy.
        </p>

        <h2>9. Contact</h2>
        <p>
          Email us at{" "}
          <a href="mailto:support@retrograde.sh">support@retrograde.sh</a>.
        </p>
      </main>
    </SiteLayout>
  );
}

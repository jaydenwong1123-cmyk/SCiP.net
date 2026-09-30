import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal-page";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_EMAIL,
  LEGAL_HOSTING_PROVIDER,
  LEGAL_OWNER,
  LEGAL_SITE_NAME,
  LEGAL_SITE_URL,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy // SCiP.net",
};

const email = (
  <a href={`mailto:${LEGAL_EMAIL}`} className="term-link">
    {LEGAL_EMAIL}
  </a>
);

const sections: LegalSection[] = [
  {
    heading: "Overview",
    body: (
      <p>
        This Privacy Policy explains how {LEGAL_SITE_NAME} ({LEGAL_SITE_URL}),
        operated by {LEGAL_OWNER} (&quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;), collects, uses, and protects your personal information
        when you visit the site. By using the site, you agree to the practices
        described here.
      </p>
    ),
  },
  {
    heading: "1. Information we collect",
    body: (
      <>
        <p>
          Account information. To use the site you register an account with an
          email address, a password (stored as a one-way hash, not in plain
          text), and a display name you choose. If you link the site to
          Discord, we also store the Discord user ID needed to match your
          account to Discord.
        </p>
        <p>
          Content you create. The site is a member terminal, and most of what
          it collects is content you write while using it: private messages to
          other members, forum posts, support tickets, and in-character
          documents such as SCP articles, incident reports, and personnel
          files.
        </p>
        <p>
          Information collected automatically. Like most websites, our hosting
          provider ({LEGAL_HOSTING_PROVIDER}) may automatically log technical
          information such as your IP address, browser type, device type, pages
          visited, and the date and time of your visit. We do not currently use
          a third-party analytics service; if that changes, this policy will be
          updated first.
        </p>
        <p>
          We do not knowingly collect sensitive information such as financial
          details, government ID numbers, or health information.
        </p>
      </>
    ),
  },
  {
    heading: "2. How we use your information",
    body: (
      <>
        <p>We use personal information only to:</p>
        <ol className="list-decimal pl-6 space-y-1">
          <li>
            Create and secure your account, and let you sign in to the site.
          </li>
          <li>
            Operate the site&apos;s features, such as delivering messages,
            displaying forum posts, and tracking tickets.
          </li>
          <li>Operate, maintain, and improve the site.</li>
          <li>Respond to questions you send us directly.</li>
          <li>Protect the site against spam, abuse, or security issues.</li>
        </ol>
        <p>We do not sell, rent, or trade your personal information.</p>
      </>
    ),
  },
  {
    heading: "3. Cookies",
    body: (
      <p>
        The site may use cookies or similar technologies for basic functionality
        and, if enabled, analytics. You can block or delete cookies through your
        browser settings. Some parts of the site may not work as intended if
        cookies are disabled.
      </p>
    ),
  },
  {
    heading: "4. How we share information",
    body: (
      <>
        <p>
          We only share personal information with service providers who help run
          the site, such as our hosting provider and, if you link your account,
          Discord, and only as needed for them to provide their services. We may
          also disclose information if required by law or to protect the rights,
          safety, or property of the site, its members, or others.
        </p>
        <p>
          Some of these providers may store or process data outside Canada,
          including in the United States, where it may be subject to the laws of
          that country.
        </p>
      </>
    ),
  },
  {
    heading: "5. Links to other websites",
    body: (
      <p>
        The site may link to other websites, such as Discord or other
        community platforms. We are not responsible for the privacy practices
        of those sites and encourage you to read their policies.
      </p>
    ),
  },
  {
    heading: "6. Data retention",
    body: (
      <p>
        We keep your account and the content you create for as long as your
        account is active, or as required by law. If your account is removed,
        we delete the associated personal information within a reasonable
        time, except where we must keep records to comply with the law or
        resolve disputes. Server logs are kept according to our hosting
        provider&apos;s standard retention periods.
      </p>
    ),
  },
  {
    heading: "7. Security",
    body: (
      <p>
        We take reasonable steps to protect personal information from loss,
        misuse, and unauthorized access. However, no website or internet
        transmission is completely secure, and we cannot guarantee absolute
        security.
      </p>
    ),
  },
  {
    heading: "8. Children's privacy",
    body: (
      <p>
        This site is not directed at children, and we do not knowingly collect
        personal information from children under 13. If you believe a child has
        sent us personal information, please contact us and we will delete it.
      </p>
    ),
  },
  {
    heading: "9. Your rights",
    body: (
      <>
        <p>
          Under British Columbia&apos;s Personal Information Protection Act
          (PIPA) and Canada&apos;s Personal Information Protection and
          Electronic Documents Act (PIPEDA), you may request access to the
          personal information we hold about you, ask us to correct it, or
          withdraw your consent to its use. To make a request, email {email}. We
          will respond within 30 days.
        </p>
        <p>
          If you are not satisfied with our response, you may contact the Office
          of the Information and Privacy Commissioner for British Columbia.
        </p>
      </>
    ),
  },
  {
    heading: "10. Changes to this policy",
    body: (
      <p>
        We may update this Privacy Policy from time to time. Changes take effect
        when posted on this page, and the effective date above will be updated.
      </p>
    ),
  },
  {
    heading: "11. Contact us",
    body: (
      <p>
        For questions about this Privacy Policy, contact {LEGAL_OWNER} at{" "}
        {email}.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      sections={sections}
    />
  );
}

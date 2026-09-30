import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal-page";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_EMAIL,
  LEGAL_OWNER,
  LEGAL_SITE_NAME,
  LEGAL_SITE_URL,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service // SCiP.net",
};

const sections: LegalSection[] = [
  {
    heading: "Overview",
    body: (
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of{" "}
        {LEGAL_SITE_NAME} ({LEGAL_SITE_URL}), operated by {LEGAL_OWNER}{" "}
        (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By accessing or
        using the site, you agree to these Terms. If you do not agree, please do
        not use the site.
      </p>
    ),
  },
  {
    heading: "1. Use of the site",
    body: (
      <>
        <p>
          You may use the site for personal, non-commercial purposes. You agree
          not to:
        </p>
        <ol className="list-decimal pl-6 space-y-1">
          <li>
            Use the site in any way that breaks the law or violates the rights
            of others.
          </li>
          <li>
            Attempt to hack, disrupt, overload, or gain unauthorized access to
            the site or its servers.
          </li>
          <li>
            Send spam, malicious code, or harassing, abusive, or offensive
            messages through the site.
          </li>
          <li>
            Copy, scrape, or republish site content in bulk without our
            permission.
          </li>
        </ol>
      </>
    ),
  },
  {
    heading: "2. Content and intellectual property",
    body: (
      <>
        <p>
          Unless otherwise noted, all content on the site, including text,
          photos, graphics, and design, belongs to {LEGAL_OWNER} or is used with
          permission. You may view and share links to the site, but you may not
          copy, modify, or distribute its content without written permission.
        </p>
        <p>
          The site is a fan-made roleplay project set in the SCP Foundation
          universe. SCP Foundation content is a collaborative fiction project
          published under a Creative Commons license; our use of it does not
          imply any affiliation with or endorsement by the SCP Foundation
          organization or its contributors. Trademarks, logos, and names of
          other platforms mentioned on the site, such as Discord, belong to
          their respective owners and are used for identification only.
        </p>
      </>
    ),
  },
  {
    heading: "3. Content you post",
    body: (
      <p>
        If you send a message, post to a forum, file a ticket, or submit any
        other content through the site, you confirm that it is your own and
        does not violate anyone&apos;s rights. All in-character content, such as
        SCP articles and incident reports, is fictional roleplay material and
        does not describe real events, organizations, or people. We may remove
        content or choose not to respond to or keep any message.
      </p>
    ),
  },
  {
    heading: "4. Links to other websites",
    body: (
      <p>
        The site may link to third-party websites for your convenience. We do
        not control those sites and are not responsible for their content,
        accuracy, or practices. Visiting them is at your own risk.
      </p>
    ),
  },
  {
    heading: "5. Accuracy of information",
    body: (
      <p>
        We try to keep the site accurate and up to date, but information such
        as announcements, member rosters, or in-character records may contain
        errors or become outdated. Nothing on the site should be treated as
        factual or official outside the roleplay it is part of.
      </p>
    ),
  },
  {
    heading: "6. Disclaimer",
    body: (
      <p>
        The site is provided &quot;as is&quot; and &quot;as available,&quot;
        without warranties of any kind, express or implied. We do not guarantee
        that the site will be uninterrupted, error-free, or free of viruses or
        other harmful components.
      </p>
    ),
  },
  {
    heading: "7. Limitation of liability",
    body: (
      <p>
        To the fullest extent permitted by law, {LEGAL_OWNER} will not be liable
        for any direct, indirect, incidental, or consequential damages arising
        from your use of, or inability to use, the site or any content on it.
      </p>
    ),
  },
  {
    heading: "8. Privacy",
    body: (
      <p>
        Your use of the site is also governed by our{" "}
        <Link href="/privacy" className="term-link">
          Privacy Policy
        </Link>
        , which explains how we handle personal information.
      </p>
    ),
  },
  {
    heading: "9. Changes to these Terms",
    body: (
      <p>
        We may update these Terms at any time. Changes take effect when posted
        on this page, and the effective date above will be updated. Continued
        use of the site after changes means you accept the updated Terms.
      </p>
    ),
  },
  {
    heading: "10. Governing law",
    body: (
      <p>
        These Terms are governed by the laws of the Province of British Columbia
        and the federal laws of Canada that apply there. Any dispute will be
        handled in the courts of British Columbia.
      </p>
    ),
  },
  {
    heading: "11. Contact us",
    body: (
      <p>
        For questions about these Terms, contact {LEGAL_OWNER} at{" "}
        <a href={`mailto:${LEGAL_EMAIL}`} className="term-link">
          {LEGAL_EMAIL}
        </a>
        .
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      sections={sections}
    />
  );
}

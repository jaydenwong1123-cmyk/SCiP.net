import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { clearanceDisplay } from "@/lib/clearance";
import { getActiveHackGrant } from "@/lib/hack/grant";
import { resolveGates } from "@/lib/sections-access";
import { getStationCounts } from "@/lib/station-counts";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  badgeCount,
  visibleSections,
  type Section,
} from "@/lib/sections";
import { StationHead, Readout, Lamp, HudBanner, HudPanel, EmptyState } from "@/components/hud";
import { db } from "@/lib/db";
import { getActivityFeed, agoLabel } from "@/lib/activity-feed";
import { isNewSince, visitMarker } from "@/lib/activity";
import { MAX_REQUESTABLE_CLEARANCE } from "@/lib/clearance";

export const metadata: Metadata = { title: "Station Board" };

// How long after joining the first-steps checklist is offered.
const FIRST_STEPS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export default async function MenuPage() {
  const user = await requireUser();
  const gates = resolveGates(user);

  // getStationCounts is request-cached and was already resolved by the app
  // layout for the command rail, so this costs nothing.
  const now = new Date();
  const isNewMember =
    now.getTime() - user.createdAt.getTime() < FIRST_STEPS_WINDOW_MS;

  const [counts, activeGrant, feed, firstSteps] = await Promise.all([
    getStationCounts(user),
    getActiveHackGrant(user.id),
    getActivityFeed(user),
    // Three small counts, and only for an account in its first month.
    isNewMember ? getFirstSteps(user) : Promise.resolve(null),
  ]);
  const marker = visitMarker(user, now);
  const newCount = feed.filter((item) => isNewSince(item.at, marker)).length;

  const sections = visibleSections(gates);
  const alerts =
    (counts.pendingRequests ?? 0) +
    (counts.openTickets ?? 0) +
    (counts.openCases ?? 0);

  return (
    <>
      <StationHead code="SCiP-NULL // STATION BOARD" title="MAIN MENU">
        <Readout
          label="Clearance"
          value={clearanceDisplay(user.clearance, user.designation)}
        />
        <Readout label="Stations" value={sections.length} />
        <Readout
          label="Action Items"
          value={alerts}
          tone={alerts > 0 ? "amber" : "dim"}
        />
        <div className="hud-readout">
          <span className="hud-readout__label">Link</span>
          <Lamp state={activeGrant ? "alert" : "on"}>
            {activeGrant ? "COMPROMISED" : "SECURE"}
          </Lamp>
        </div>
      </StationHead>

      {firstSteps && firstSteps.some((s) => !s.done) && (
        <HudPanel
          code="00"
          title="FIRST STEPS"
          status={`${firstSteps.filter((s) => s.done).length} OF ${firstSteps.length} COMPLETE`}
        >
          <ul className="list-none space-y-1 text-sm">
            {firstSteps.map((s) => (
              <li key={s.href} className="flex flex-wrap items-baseline gap-2">
                <span
                  aria-hidden
                  className={
                    s.done ? "text-[var(--term-fg-dim)]" : "text-[var(--term-amber)]"
                  }
                >
                  {s.done ? "[x]" : "[ ]"}
                </span>
                {s.done ? (
                  <span className="text-[var(--term-fg-dim)] line-through">
                    {s.label}
                  </span>
                ) : (
                  <Link href={s.href} className="term-link">
                    {s.label}
                  </Link>
                )}
                <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
              </li>
            ))}
          </ul>
        </HudPanel>
      )}

      <HudPanel
        code="01"
        title="LATEST ACTIVITY"
        status={
          marker === null
            ? `${feed.length} RECENT`
            : newCount > 0
              ? `${newCount} NEW SINCE YOUR LAST VISIT`
              : "NOTHING NEW SINCE YOUR LAST VISIT"
        }
      >
        <div className="hud-list">
          {feed.length === 0 && (
            <EmptyState title="No activity on record">
              <p className="text-xs">
                NEW FILES, INCIDENTS, BROADCASTS AND FORUM REPLIES APPEAR HERE.
              </p>
              <Link href="/forums" className="term-button term-button--sm mt-1">
                OPEN THE FORUMS
              </Link>
            </EmptyState>
          )}
          {feed.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm term-row no-underline px-1"
            >
              <span className="flex flex-wrap items-center gap-2 min-w-0 break-words">
                <span className="hud-recid">[{item.kind}]</span>
                <span className="text-[var(--term-fg-bright)]">{item.title}</span>
                {isNewSince(item.at, marker) && (
                  <span className="clearance-chip text-[10px]">NEW</span>
                )}
              </span>
              <span className="shrink-0 hud-recid">
                {item.detail && <>{item.detail} · </>}
                {agoLabel(item.at, now)}
              </span>
            </Link>
          ))}
        </div>
      </HudPanel>

      <p className="text-[var(--term-fg-dim)] text-xs">
        {"// SELECT A STATION TO CONTINUE"}
      </p>

      {GROUP_ORDER.map((group) => {
        const inGroup = sections.filter((s) => s.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-2">
            <HudBanner level="internal">▸ {GROUP_LABELS[group]}</HudBanner>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {inGroup.map((s) => (
                <StationTile
                  key={s.base}
                  section={s}
                  count={badgeCount(s, counts)}
                  // The unknown terminal is the one tile whose description
                  // changes with session state — an active illicit grant is
                  // exactly the thing its owner needs to see.
                  desc={
                    s.base === "/hack" && activeGrant
                      ? `ILLICIT ${clearanceDisplay(activeGrant.tier, null)} ACCESS ACTIVE`
                      : s.desc
                  }
                  {...stationState(s, !!activeGrant)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

// The checklist a new member sees on the board until it is complete. Each step
// is something they can do at L-1 with no grant, and each is detected from the
// record it leaves rather than stored as a flag.
async function getFirstSteps(user: {
  id: string;
  clearance: number;
  department: string | null;
  personalFile: string;
}): Promise<{ label: string; href: string; done: boolean }[]> {
  const [forumPosts, sentMessages, clearanceRequests] = await Promise.all([
    db.forumPost.count({ where: { authorId: user.id } }),
    db.message.count({ where: { senderId: user.id } }),
    db.clearanceRequest.count({ where: { userId: user.id } }),
  ]);
  return [
    {
      label: "COMPLETE YOUR PERSONNEL DOSSIER",
      href: "/profile",
      done: !!user.department && user.personalFile.trim() !== "",
    },
    {
      label: "POST IN A FORUM TOPIC",
      href: "/forums",
      done: forumPosts > 0,
    },
    {
      label: "SEND A MESSAGE TO ANOTHER MEMBER",
      href: "/messages/compose",
      done: sentMessages > 0,
    },
    {
      label: "REQUEST HIGHER CLEARANCE",
      href: "/clearance-request",
      done: clearanceRequests > 0 || user.clearance >= MAX_REQUESTABLE_CLEARANCE,
    },
  ];
}

// A station's lamp and its label, kept together so the colour and the word can
// never disagree — an "UNVERIFIED" node must not show a green light.
function stationState(
  section: Section,
  grantActive: boolean
): { lamp: "on" | "warn" | "alert" | "off"; lampText: string } {
  if (section.base === "/hack") {
    return grantActive
      ? { lamp: "alert", lampText: "ACTIVE" }
      : { lamp: "warn", lampText: "UNVERIFIED" };
  }
  if (section.accent === "red") return { lamp: "warn", lampText: "RESTRICTED" };
  if (section.gate) return { lamp: "warn", lampText: "RESTRICTED" };
  return { lamp: "on", lampText: "ONLINE" };
}

function StationTile({
  section,
  count,
  desc,
  lamp,
  lampText,
}: {
  section: Section;
  count: number;
  desc: string;
  lamp: "on" | "warn" | "alert" | "off";
  lampText: string;
}) {
  const accent =
    section.accent === "amber"
      ? " menu-tile--amber"
      : section.accent === "red"
        ? " menu-tile--red"
        : "";

  return (
    <Link href={section.base} className={`menu-tile term-panel${accent}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="hud-recid">[{section.code}]</span>
        <Lamp state={lamp}>{lampText}</Lamp>
      </div>

      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span
          className="text-sm sm:text-base text-[var(--term-fg-bright)]"
          style={{ letterSpacing: "0.12em" }}
        >
          {section.label}
        </span>
        {count > 0 && (
          <span
            className="clearance-chip text-[10px]"
            // The count is meaningless to a screen reader without the noun, so
            // the accessible name carries both.
            aria-label={`${count} ${section.badgeLabel ?? "new"}`}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-[var(--term-fg-dim)] leading-snug">{desc}</p>

      <div className="mt-3 text-xs text-[var(--term-fg-dim)] menu-tile__prompt">
        {"> ACCESS"} <span className="menu-tile__caret">_</span>
      </div>
    </Link>
  );
}

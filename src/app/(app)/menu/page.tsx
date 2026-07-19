import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canAccessSecureChannel, clearanceDisplay } from "@/lib/clearance";

type Tile = {
  href: string;
  label: string;
  code: string;
  desc: string;
  accent?: "amber" | "red";
};

export default async function MenuPage() {
  const user = await requireUser();

  const tiles: Tile[] = [
    { href: "/personnel", label: "PERSONNEL", code: "SEC-01", desc: "Personnel registry & clearance records" },
    { href: "/messages", label: "MESSAGES", code: "SEC-02", desc: "Encrypted internal correspondence" },
    { href: "/scp", label: "SCP FILES", code: "SEC-03", desc: "Anomaly containment documentation" },
    { href: "/incidents", label: "INCIDENTS", code: "SEC-04", desc: "Breach & incident reports" },
    { href: "/broadcasts", label: "BROADCASTS", code: "SEC-05", desc: "Site-wide directives & bulletins" },
    { href: "/clearance-request", label: "CLEARANCE", code: "SEC-06", desc: "Request clearance elevation" },
  ];

  if (canAccessSecureChannel(user.clearance)) {
    tiles.push({
      href: "/secure-channel",
      label: "⚿ SECURE CHANNEL",
      code: "L-5+",
      desc: "Encrypted high-clearance channel",
      accent: "amber",
    });
  }

  if (user.isOwner || user.isAdmin || user.isStaff) {
    tiles.push({
      href: "/admin",
      label: "ADMIN",
      code: "ADM",
      desc: "Site administration & member control",
      accent: "red",
    });
  }

  tiles.push({ href: "/profile", label: "PROFILE", code: "USR", desc: "Your personnel dossier" });
  tiles.push({ href: "/settings", label: "SETTINGS", code: "CFG", desc: "Terminal appearance & preferences" });

  return (
    <div className="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-4">
      <div className="text-center">
        <div className="text-lg sm:text-2xl tracking-widest text-[var(--term-fg-bright)]">
          MAIN MENU
        </div>
        <div className="text-xs sm:text-sm text-[var(--term-fg-dim)] mt-1">
          {"// SELECT A MODULE TO CONTINUE"} — CLEARANCE{" "}
          {clearanceDisplay(user.clearance, user.designation)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className={`menu-tile term-panel${
              tile.accent === "amber"
                ? " menu-tile--amber"
                : tile.accent === "red"
                  ? " menu-tile--red"
                  : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm sm:text-base tracking-wider text-[var(--term-fg-bright)]">
                {tile.label}
              </span>
              <span className="text-[10px] sm:text-xs text-[var(--term-fg-dim)]">
                [{tile.code}]
              </span>
            </div>
            <p className="mt-2 text-xs sm:text-sm text-[var(--term-fg-dim)] leading-snug">
              {tile.desc}
            </p>
            <div className="mt-3 text-xs text-[var(--term-fg-dim)] menu-tile__prompt">
              {"> ACCESS"} <span className="menu-tile__caret">_</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

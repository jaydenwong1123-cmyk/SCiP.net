import { CLEARANCE_LEVELS, clearanceLabel } from "@/lib/clearance";

// The "who is this aimed at" control shared by the issue and amend forms.
//
// Offers every level up to the issuer's own, plus the directive's current
// level even when that sits above it, so amending an admin-owned directive
// never silently retargets it. The server enforces the same ceiling; this only
// keeps the list honest.
export function AudienceField({
  maxClearance,
  current = 1,
}: {
  maxClearance: number;
  current?: number;
}) {
  const levels = CLEARANCE_LEVELS.filter(
    (l) => l.rank <= maxClearance || l.rank === current
  );

  return (
    <div>
      <label className="block text-sm mb-1" htmlFor="clearanceRequired">
        AUDIENCE{" "}
        <span className="text-[var(--term-fg-dim)]">(MINIMUM CLEARANCE TO READ)</span>
      </label>
      <select
        id="clearanceRequired"
        name="clearanceRequired"
        required
        defaultValue={current}
        className="term-input"
      >
        {levels.map((l) => (
          <option key={l.rank} value={l.rank}>
            {l.rank === 1
              ? `${clearanceLabel(l.rank)} — ALL PERSONNEL`
              : `${clearanceLabel(l.rank)} AND ABOVE`}
          </option>
        ))}
      </select>
    </div>
  );
}

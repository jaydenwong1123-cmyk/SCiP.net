import { canAccessSecureChannel } from "@/lib/clearance";
import { canAccessMessageLogs } from "@/lib/message-logs";
import { canAccessCounterIntel } from "@/lib/counter-intel";
import { hasStaffPowers, hasHelperPowers } from "@/lib/session";
import type { Gates } from "@/lib/sections";

// Server-side half of the station registry.
//
// lib/sections.ts stays client-safe by naming its access gates as strings.
// This module is where those names are bound to the app's actual permission
// predicates — the same functions each route guards itself with, so the rail
// can never advertise a station the route would then deny. Keeping the binding
// in one place is the point: no gate logic is reimplemented here.

export type GateUser = {
  clearance: number;
  designation: string | null;
  department?: string | null;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isHelper: boolean;
};

export function resolveGates(user: GateUser): Gates {
  return {
    secureChannel: canAccessSecureChannel(user.clearance),
    messageLogs: canAccessMessageLogs(user),
    counterIntel: canAccessCounterIntel(user),
    staff: hasStaffPowers(user),
    helper: hasHelperPowers(user),
  };
}

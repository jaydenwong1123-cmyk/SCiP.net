import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import {
  spendAttempt,
  refundAttempt,
  clearAttempts,
  pruneAttempts,
  LOGIN_RULE,
  LOGIN_IP_RULE,
} from "@/lib/rate-limit";
import { logAuditNow, clientIp, AUDIT_ACTIONS } from "@/lib/audit";

// The full instance: session strategy, pages and callbacks come from
// lib/auth.config (shared with the proxy), and only the database-backed
// Credentials provider is added on top. Keep provider-free settings in the
// shared config so the proxy and this instance can never drift apart.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const normalizedEmail = email.toLowerCase();
        const ip = await clientIp();
        await pruneAttempts();

        // Two buckets: one per account (stops a targeted password guess) and
        // one per client IP (stops a spray across many accounts). Either
        // tripping refuses the attempt.
        //
        // The guess is spent BEFORE the password is checked, so a burst of
        // simultaneous requests cannot all slip in under the limit — see
        // spendAttempt. A failed attempt keeps its rows whether or not the
        // account exists, so the throttle can't be used to probe which emails
        // are registered.
        const [perAccount, perIp] = await Promise.all([
          spendAttempt("login", normalizedEmail, LOGIN_RULE, ip),
          spendAttempt("login-ip", ip || "unknown", LOGIN_IP_RULE, ip),
        ]);

        if (perAccount.blocked || perIp.blocked) {
          // Whichever bucket still had room took a slot; give it back, since
          // this request never got to guess.
          await Promise.all([
            perAccount.blocked ? null : refundAttempt(perAccount.attemptId),
            perIp.blocked ? null : refundAttempt(perIp.attemptId),
          ]);
          // Logged so staff can see a lockout in the access log. Recorded
          // synchronously: `authorize` runs outside a request scope where
          // `after()` callbacks would be honored.
          await logAuditNow(
            {
              action: AUDIT_ACTIONS.loginBlocked,
              actor: null,
              targetType: "auth",
              targetName: normalizedEmail,
              summary: perAccount.blocked
                ? `Login throttled for ${normalizedEmail}`
                : `Login throttled for IP ${ip || "unknown"}`,
            },
            ip
          );
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // A correct password is not a failed guess: it costs nothing on the IP
        // bucket, and it clears the account bucket so an honest member who
        // mistyped a few times starts clean. This also covers suspended
        // accounts, which cannot authenticate but did not guess wrong.
        await Promise.all([
          refundAttempt(perIp.attemptId),
          clearAttempts("login", normalizedEmail),
        ]);
        if (user.suspended) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? undefined,
        };
      },
    }),
  ],
});

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  checkRateLimit,
  recordAttempt,
  clearAttempts,
  pruneAttempts,
  LOGIN_RULE,
  LOGIN_IP_RULE,
} from "@/lib/rate-limit";
import { logAuditNow, clientIp, AUDIT_ACTIONS } from "@/lib/audit";

// Both throttle buckets advance on every failed credential attempt.
async function recordFailure(email: string, ip: string) {
  await Promise.all([
    recordAttempt("login", email, ip),
    recordAttempt("login-ip", ip || "unknown", ip),
  ]);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
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
        const [perAccount, perIp] = await Promise.all([
          checkRateLimit("login", normalizedEmail, LOGIN_RULE),
          checkRateLimit("login-ip", ip || "unknown", LOGIN_IP_RULE),
        ]);

        if (perAccount.blocked || perIp.blocked) {
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

        // A failed attempt is recorded whether or not the account exists, so
        // the throttle can't be used to probe which emails are registered.
        if (!user) {
          await recordFailure(normalizedEmail, ip);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await recordFailure(normalizedEmail, ip);
          return null;
        }

        // Suspended accounts cannot authenticate. Not a credential failure, so
        // it doesn't count against the throttle.
        if (user.suspended) return null;

        // Success clears the account bucket so an honest member who mistyped
        // a few times starts clean.
        await clearAttempts("login", normalizedEmail);

        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});

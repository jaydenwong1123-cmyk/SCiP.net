"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const email = username.includes("@") ? username : `${username}@foundation.scp`;

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setPending(false);
    if (!result || result.error) {
      setError("ACCESS DENIED. CHECK CREDENTIALS.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="term-panel w-full max-w-md space-y-4">
        <h1 className="text-lg tracking-widest">:: SCiP.NET SECURE LOGIN ::</h1>
        <form action={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1" htmlFor="username">
              USERNAME
            </label>
            <input
              id="username"
              name="username"
              required
              className="term-input"
              placeholder="lcheung"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="password">
              PASSWORD
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="term-input"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-[var(--term-red)] text-sm">{error}</p>}
          <button type="submit" disabled={pending} className="term-button w-full">
            {pending ? "AUTHENTICATING..." : "LOGIN"}
          </button>
        </form>
        <p className="text-sm text-[var(--term-fg-dim)]">
          NO ACCOUNT? <Link href="/register" className="term-link">REGISTER WITH INVITE CODE</Link>
        </p>
      </div>
    </div>
  );
}

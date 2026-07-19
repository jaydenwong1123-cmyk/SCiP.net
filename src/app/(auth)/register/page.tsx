"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type RegisterResult } from "../actions";
import { DISCORD_INVITE_URL } from "@/lib/links";

const initialState: RegisterResult | null = null;

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="term-panel w-full max-w-md space-y-4">
        <h1 className="text-lg tracking-widest">:: NEW PERSONNEL REGISTRATION ::</h1>

        <div className="border-2 border-[var(--term-amber)] p-3 space-y-1">
          <p className="text-[var(--term-amber)] text-sm tracking-wide">
            ◈ REQUIRED: JOIN THE FOUNDATION DISCORD
          </p>
          <p className="text-xs text-[var(--term-fg-dim)]">
            All personnel must be present in our secure Discord channel before
            operating on the network.
          </p>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="term-button inline-block text-center w-full text-sm"
            style={{ borderColor: "var(--term-amber)", color: "var(--term-amber)" }}
          >
            ▶ JOIN DISCORD SERVER
          </a>
        </div>

        {state?.ok ? (
          <div className="space-y-3">
            <p className="text-[var(--term-amber)]">
              ACCOUNT CREATED. RECORD YOUR CREDENTIALS — THE PASSWORD IS SHOWN ONLY ONCE.
            </p>
            <div className="term-panel space-y-1">
              <p>LOGIN: {state.email}</p>
              <p>PASSWORD: {state.password}</p>
            </div>
            <Link href="/login" className="term-button inline-block text-center w-full">
              PROCEED TO LOGIN
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-3">
            <div>
              <label className="block text-sm mb-1" htmlFor="username">
                DESIRED USERNAME (login will be username@foundation.scp)
              </label>
              <input
                id="username"
                name="username"
                required
                className="term-input"
                placeholder="lcheung"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm mb-1" htmlFor="inviteCode">
                INVITE CODE
              </label>
              <input
                id="inviteCode"
                name="inviteCode"
                required
                className="term-input"
                placeholder="XXXX-XXXX-0000"
                autoComplete="off"
              />
            </div>
            {state?.ok === false && (
              <p className="text-[var(--term-red)] text-sm">{state.error}</p>
            )}
            <button type="submit" disabled={pending} className="term-button w-full">
              {pending ? "PROCESSING..." : "REGISTER"}
            </button>
          </form>
        )}

        <p className="text-sm text-[var(--term-fg-dim)]">
          ALREADY REGISTERED? <Link href="/login" className="term-link">LOGIN HERE</Link>
        </p>
      </div>
    </div>
  );
}

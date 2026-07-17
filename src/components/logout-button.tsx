"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      className="term-link cursor-pointer bg-transparent border-none p-0 text-[var(--term-fg)]"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      [LOGOUT]
    </button>
  );
}

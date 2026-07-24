"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteConfig, isLockedNow, MAINT_COOKIE } from "@/lib/site-config";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";

export async function submitBypassCodeAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const code = String(formData.get("code") ?? "").trim();
  const cfg = await getSiteConfig();

  // Already back online (disabled, or the scheduled window lapsed) — let them
  // through.
  if (!isLockedNow(cfg)) redirect("/");

  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }
  if (!code || !cfg.bypassCode || code !== cfg.bypassCode) {
    return { ok: false, error: "ACCESS CODE REJECTED." };
  }

  const jar = await cookies();
  jar.set(MAINT_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}

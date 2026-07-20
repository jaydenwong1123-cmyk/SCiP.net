"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getRealUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { VIEW_AS_COOKIE, canViewAs, viewAsOptions } from "@/lib/view-as";

// Enter or leave a "view as" simulation. Both paths read the real user row,
// never the downgraded persona, so a session already simulating L-1 can still
// change or clear its own simulation.
export async function setViewAsAction(formData: FormData) {
  const user = await getRealUser();
  if (!user) redirect("/login");
  if (!canViewAs(user)) redirect("/");

  const raw = String(formData.get("clearance") ?? "");
  const jar = await cookies();

  if (raw === "") {
    jar.delete(VIEW_AS_COOKIE);
  } else {
    const rank = parseInt(raw, 10);
    if (!viewAsOptions(user.clearance).includes(rank)) redirect("/settings");
    jar.set(VIEW_AS_COOKIE, String(rank), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // Session-scoped on purpose: a simulation should not outlive the browser
      // session and quietly hide access the next time they sign in.
    });
  }

  revalidatePath("/", "layout");
}

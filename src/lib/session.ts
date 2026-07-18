import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return db.user.findUnique({ where: { id: session.user.id } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.displayName) redirect("/set-name");
  return user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (!user.isOwner) redirect("/");
  return user;
}

// Owners and members granted admin can access administration + delete SCP files.
export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isOwner && !user.isAdmin) redirect("/");
  return user;
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canCreateForum, authoringClearance } from "@/lib/clearance";
import { NewForumForm } from "./new-forum-form";
import { StationHead, HudPanel } from "@/components/hud";

export default async function NewForumPage() {
  const user = await requireUser();
  if (!canCreateForum(authoringClearance(user))) redirect("/forums");

  return (
    <>
      <StationHead code="SEC-08 // OPEN TOPIC" title="NEW FORUM">
        <Link href="/forums" className="term-link text-sm">
          [BACK TO FORUMS]
        </Link>
      </StationHead>
      <HudPanel code="01" title="TOPIC CHARTER">
        <NewForumForm maxClearance={authoringClearance(user)} />
      </HudPanel>
    </>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setPrimaryModel, setSlackLink } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";

/** Saves the primary model. setPrimaryModel refuses anyone who is not a manager. */
export async function savePrimaryModel(formData: FormData) {
  const { actor } = await requireActor();
  await setPrimaryModel(actor, String(formData.get("model") ?? ""));
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

/** Links a person's Slack member id. setSlackLink refuses non-managers and malformed ids. */
export async function saveSlackLink(formData: FormData) {
  const { actor } = await requireActor();
  const personId = String(formData.get("personId") ?? "");
  try {
    await setSlackLink(actor, personId, String(formData.get("slackUserId") ?? ""));
  } catch (err) {
    redirect(`/settings?slackError=${encodeURIComponent(err instanceof Error ? err.message : "Could not save")}#slack`);
  }
  revalidatePath("/settings");
  redirect("/settings?slackSaved=1#slack");
}

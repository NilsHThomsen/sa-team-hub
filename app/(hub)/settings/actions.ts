"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { setMonthlyBudget, setPrimaryModel, setSlackLink } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";

/** Saves the primary model. setPrimaryModel refuses anyone who is not a manager. */
export async function savePrimaryModel(formData: FormData) {
  const { actor } = await requireActor();
  await setPrimaryModel(actor, String(formData.get("model") ?? ""));
  updateTag("settings"); // cachedPrimaryModel in lib/cached.ts
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

/** Saves (or clears) the monthly AI spend target shown on AI Usage. setMonthlyBudget refuses non-managers and bad amounts. */
export async function saveMonthlyBudget(formData: FormData) {
  const { actor } = await requireActor();
  try {
    await setMonthlyBudget(actor, String(formData.get("budget") ?? ""));
  } catch (err) {
    redirect(`/settings?budgetError=${encodeURIComponent(err instanceof Error ? err.message : "Could not save")}#budget`);
  }
  revalidatePath("/settings");
  revalidatePath("/usage");
  redirect("/settings?budgetSaved=1#budget");
}

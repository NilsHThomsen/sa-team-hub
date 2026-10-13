"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setPrimaryModel } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";

/** Saves the primary model. setPrimaryModel refuses anyone who is not a manager. */
export async function savePrimaryModel(formData: FormData) {
  const { actor } = await requireActor();
  await setPrimaryModel(actor, String(formData.get("model") ?? ""));
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

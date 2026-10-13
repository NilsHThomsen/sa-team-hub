"use server";

import { revalidatePath } from "next/cache";
import { AccessDenied } from "@/agent/lib/actor";
import { setCareerGoal } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";

/** Called from the career goal picker. The data layer decides who may change whose goal. */
export async function updateCareerGoal(personId: string, goal: string): Promise<{ error?: string }> {
  const { actor } = await requireActor();
  try {
    await setCareerGoal(actor, { personId, goal });
  } catch (err) {
    if (err instanceof AccessDenied || err instanceof Error) return { error: err.message };
    throw err;
  }
  revalidatePath("/dev-plans");
  return {};
}

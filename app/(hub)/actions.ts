"use server";

import { headers } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { decidePromotionCase, decideShoutout } from "@/agent/lib/data";
import { wakeShoutoutWorkflow } from "@/agent/lib/shoutouts";
import { requireActor } from "@/lib/viewer";

/** Accept or Decline on a home-page shout-out. The data layer checks it is the recipient answering. */
export async function answerShoutout(id: number, accept: boolean): Promise<{ error?: string }> {
  const { actor } = await requireActor();
  try {
    const result = await decideShoutout(actor, id, accept);
    // Tell the waiting workflow to look now. The webhook URL may be a path, so
    // resolve it against the host this request came in on.
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    await wakeShoutoutWorkflow(result.webhookUrl, origin);
  } catch (err) {
    if (err instanceof Error) return { error: err.message };
    throw err;
  }
  revalidatePath("/");
  revalidatePath("/achievements");
  return {};
}

/** Approve or Decline on a drafted promotion case (Talent page and Home). The data layer checks it is a manager. */
export async function answerPromotionCase(id: number, approve: boolean): Promise<{ error?: string }> {
  const { actor } = await requireActor();
  try {
    await decidePromotionCase(actor, id, approve);
  } catch (err) {
    if (err instanceof Error) return { error: err.message };
    throw err;
  }
  revalidatePath("/");
  revalidatePath("/talent");
  return {};
}

/**
 * Called by the Ask the agent panel when a turn finishes. The agent's tools can't clear
 * Next.js caches (updateTag only works in Server Actions), so the panel does it here:
 * a digest the agent just saved shows on Home straight away instead of after the cache
 * refreshes. Clearing it after a turn that didn't touch the digest only costs one query.
 */
export async function afterAgentTurn(): Promise<void> {
  await requireActor();
  updateTag("digest");
}

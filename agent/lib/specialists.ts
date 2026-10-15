import { defineAgent } from "eve";
import { actorFromAuth, isManager } from "./actor";
import { CONTEXT_WINDOW_TOKENS, gatewayOptions, primaryModel } from "./models";

// Shared set-up for the specialist subagents (deals, skills_and_plans, talent).
// Each one runs on the same model the manager picked for the session, with the
// caller's own sign-in, so every tool still applies that person's access rules.
// A dynamic subagent can't set `defaultTools` at runtime (eve rejects the whole
// subagent), so the shell, file and web tools are removed with disableTool()
// files in each subagent's tools/ folder instead.

export type ResolverContext = { session: { auth: { current: Parameters<typeof actorFromAuth>[0] } } };

export async function specialist(description: string, ctx: ResolverContext) {
  // The same setting the main agent read when the session started.
  const model = await primaryModel();
  return defineAgent({
    description,
    model,
    modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
    modelOptions: { providerOptions: gatewayOptions("chat", model, spendUser(ctx)) },
  });
}

/** Who a model call's spend belongs to in Gateway reports: a person id, "app" for the digest, or nobody. */
export function spendUser(ctx: ResolverContext): string | undefined {
  try {
    const actor = actorFromAuth(ctx.session.auth.current);
    return actor.kind === "user" ? actor.personId : "app";
  } catch {
    return undefined;
  }
}

/** True for a signed-in manager outside a shared Slack channel. */
export function callerIsManager(ctx: ResolverContext): boolean {
  try {
    return isManager(actorFromAuth(ctx.session.auth.current));
  } catch {
    return false;
  }
}

import { defineAgent } from "eve";
import { actorFromAuth, isManager } from "./actor";
import { CONTEXT_WINDOW_TOKENS, gatewayOptions, primaryModel } from "./models";

// Shared set-up for the specialist subagents (deals, skills_and_plans, talent).
// Each one runs on the same model the manager picked for the session, with no
// shell, file or web tools, and with the caller's own sign-in, so every tool
// still applies that person's access rules.

type ResolverContext = { session: { auth: { current: Parameters<typeof actorFromAuth>[0] } } };

export async function specialist(description: string) {
  // The same setting the main agent read when the session started.
  const model = await primaryModel();
  return defineAgent({
    description,
    model,
    modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
    modelOptions: { providerOptions: gatewayOptions("chat", model) },
    defaultTools: false,
  });
}

/** True for a signed-in manager outside a shared Slack channel. */
export function callerIsManager(ctx: ResolverContext): boolean {
  try {
    return isManager(actorFromAuth(ctx.session.auth.current));
  } catch {
    return false;
  }
}

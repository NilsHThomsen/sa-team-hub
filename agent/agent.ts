import { defineAgent, defineDynamic } from "eve";
import { CONTEXT_WINDOW_TOKENS, gatewayOptions, primaryModel } from "./lib/models";

export default defineAgent({
  // A plain "provider/model" string routes through Vercel AI Gateway. On Vercel
  // the deployment authenticates to Gateway with OIDC, so there are no provider
  // API keys in this project.
  //
  // The primary model is chosen by a manager on the Settings page, so it is read
  // once when each session starts (switching mid-session would throw away the
  // prompt cache). Sessions already running keep the model they started with.
  model: defineDynamic({
    events: {
      "session.started": async () => {
        const model = await primaryModel();
        return {
          model,
          modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
          // Ordered fallback on another provider, and a tag so chat spend is
          // separable from workflow spend in Gateway usage.
          modelOptions: { providerOptions: gatewayOptions("chat", model) },
        };
      },
    },
  }),

  // Least privilege: no shell, file system or web tools. This agent only needs
  // the typed tools in agent/tools, each of which enforces the caller's role.
  defaultTools: false,

  // Guard rails on spend. Gateway reports cost per step; eve pauses the session
  // and asks to continue once either cap is reached.
  limits: {
    maxTokenCostUsdPerSession: 1,
    maxOutputTokensPerSession: 60_000,
  },
});

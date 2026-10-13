import { defineAgent } from "eve";

export default defineAgent({
  // A plain "provider/model" string routes through Vercel AI Gateway. On Vercel
  // the deployment authenticates to Gateway with OIDC, so there are no provider
  // API keys in this project.
  model: "anthropic/claude-sonnet-5",
  // Set explicitly so builds do not depend on fetching the Gateway model catalog,
  // and so compaction triggers at a predictable size.
  modelContextWindowTokens: 200_000,

  modelOptions: {
    providerOptions: {
      gateway: {
        // Ordered fallback: if Anthropic errors or is degraded, Gateway retries on
        // the next model. Same list as lib/models.ts, which the workflow uses.
        models: ["openai/gpt-6-luna-fast"],
        // Shows up in Gateway usage so chat spend is separable from workflow spend.
        tags: ["app:sa-team-hub", "feature:chat"],
      },
    },
  },

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

// Model routing for direct AI SDK calls made by our own code (the promotion-case
// workflow). The chat agent's model is configured in agent/agent.ts; keep the
// two in step.
//
// Every call goes through AI Gateway by using a "provider/model" string:
//   - `models` is Gateway's ordered fallback list. If the primary provider errors
//     or is degraded, Gateway retries the next model, with no code change here.
//   - `tags` attribute spend per feature in Gateway's usage reports, which is how
//     we answer "what does one promotion case cost?".
export const PRIMARY_MODEL = "anthropic/claude-sonnet-5";
export const FALLBACK_MODELS = ["openai/gpt-6-luna-fast"];

export function gatewayOptions(feature: string) {
  return { gateway: { models: FALLBACK_MODELS, tags: ["app:sa-team-hub", `feature:${feature}`] } };
}

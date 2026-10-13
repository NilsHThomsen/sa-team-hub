import { db } from "./db";

// Model routing for the chat agent (agent/agent.ts) and for direct AI SDK calls
// made by our own code (the promotion-case workflow). A manager picks the
// primary model on the Settings page; it is stored in app_settings.
//
// Every call goes through AI Gateway by using a "provider/model" string:
//   - `models` is Gateway's ordered fallback list. If the primary provider errors
//     or is degraded, Gateway retries the next model, with no code change here.
//   - `tags` attribute spend per feature in Gateway's usage reports, which is how
//     we answer "what does one promotion case cost?".
export const MODEL_OPTIONS = [
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", note: "Balanced quality and cost. The default." },
  { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5", note: "Most capable, highest cost." },
  { id: "openai/gpt-6-sol", label: "GPT-6 Sol", note: "OpenAI's flagship model." },
  { id: "openai/gpt-6-luna-fast", label: "GPT-6 Luna Fast", note: "Fastest and cheapest." },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "Fast, from Google." },
] as const;

export type ModelId = (typeof MODEL_OPTIONS)[number]["id"];
export const DEFAULT_MODEL: ModelId = "anthropic/claude-sonnet-5";
// Set explicitly so eve does not need the Gateway catalog, and compaction triggers
// at a predictable size. Every model above supports at least this much.
export const CONTEXT_WINDOW_TOKENS = 200_000;

export function isModelId(value: string): value is ModelId {
  return MODEL_OPTIONS.some((m) => m.id === value);
}

export function modelLabel(id: string): string {
  return MODEL_OPTIONS.find((m) => m.id === id)?.label ?? id;
}

/** Fall back to a different provider, so one provider's outage never takes the agent down. */
export function fallbackFor(primary: ModelId): ModelId {
  return primary.startsWith("anthropic/") ? "openai/gpt-6-luna-fast" : DEFAULT_MODEL;
}

export function gatewayOptions(feature: string, primary: ModelId) {
  return { gateway: { models: [fallbackFor(primary)], tags: ["app:sa-team-hub", `feature:${feature}`] } };
}

/** The primary model chosen on the Settings page. Never throws: a read failure uses the default. */
export async function primaryModel(): Promise<ModelId> {
  try {
    const [row] = await db()<{ value: string }[]>`select value from app_settings where key = 'primary_model'`;
    return row && isModelId(row.value) ? row.value : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

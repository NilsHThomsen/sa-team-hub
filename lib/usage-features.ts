// The `feature:` tags agent/lib/models.ts puts on model calls (see gatewayOptions),
// as the AI Usage page offers them. A plain module, so both the server page and
// the client filter can import it.
export const FEATURES = [
  { id: "chat", name: "Chat and digest" },
  { id: "promotion-case", name: "Promotion cases" },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

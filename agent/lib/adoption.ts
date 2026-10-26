// The Vercel products tracked per customer on the Accounts tab. No imports, so
// db/setup.ts can use it under plain node.
export const ADOPTION_PRODUCTS = [
  "Next.js",
  "Fluid compute",
  "CDN & ISR",
  "Microfrontends",
  "Firewall",
  "BotID",
  "Rolling Releases",
  "AI SDK",
  "AI Gateway",
  "Workflow",
  "v0",
] as const;
export type AdoptionProduct = (typeof ADOPTION_PRODUCTS)[number];

export const ADOPTION_STATUSES = ["using", "piloting", "not_using"] as const;
export type AdoptionStatus = (typeof ADOPTION_STATUSES)[number];

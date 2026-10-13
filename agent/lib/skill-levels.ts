// Product skill levels, stored as 0-4 so they compare and sort, shown by name.
// Each level is what the SA can do with that product in front of a customer.
export const SKILL_LEVELS = ["None", "Elevator", "Present", "Demo", "Prove"] as const;
export type SkillLevelName = (typeof SKILL_LEVELS)[number];

export const SKILL_LEVEL_MEANING: Record<SkillLevelName, string> = {
  None: "No exposure yet",
  Elevator: "Can give the elevator pitch",
  Present: "Can present it to a customer",
  Demo: "Can run a live demo",
  Prove: "Can run a POC and prove it in the customer's environment",
};

export function skillLevelName(level: number | null | undefined): SkillLevelName {
  return SKILL_LEVELS[Math.max(0, Math.min(4, level ?? 0))];
}

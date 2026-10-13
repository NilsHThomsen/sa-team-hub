// The career paths an SA can be working towards. Dev Plans shows one heading
// per goal, in this order; people with no goal yet sit under "Not set".
export const CAREER_GOALS = [
  "Senior SA",
  "Principal SA",
  "Field CTO",
  "Manager",
  "Product Manager",
  "Developer Relations",
  "Sales",
  "Exploring options",
] as const;

export type CareerGoal = (typeof CAREER_GOALS)[number];

export function isCareerGoal(value: string): value is CareerGoal {
  return (CAREER_GOALS as readonly string[]).includes(value);
}

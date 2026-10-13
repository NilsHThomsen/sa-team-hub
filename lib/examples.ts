import type { Role } from "@/agent/lib/session";

// Canned prompts shown in the empty chat, so a reviewer can try the agent in one click.
export function examplePrompts(role: Role): string[] {
  return role === "manager"
    ? [
        "Which deals need attention this week?",
        "Where are our biggest skills gaps for next quarter, and who is closest to closing them?",
        "Log a win for Hannah Kim: she ran the Kestrel Insurance AI workshop yesterday with 12 attendees.",
        "Draft a promotion case for Priya Nair to Principal SA.",
        "Mei Chen accepted the counter-offer. Lower her retention risk to medium.",
      ]
    : [
        "Log a win: I presented the Harbour Bank architecture at the APJ field call today.",
        "What skills should I focus on next quarter?",
        "How is my development plan tracking?",
        "What is Tom Becker's retention risk?",
      ];
}

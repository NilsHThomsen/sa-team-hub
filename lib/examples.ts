import type { Role } from "@/agent/lib/session";

// Canned prompts shown in the empty chat, so a reviewer can try the agent in one click.
export function examplePrompts(role: Role): string[] {
  return role === "manager"
    ? [
        "Which deals need attention this week?",
        "Which deals have presales and forecast out of line?",
        "Update Dept. of Transport: panel submission is in, shortlist decision due 7 Nov.",
        "Where are our biggest skills gaps for next quarter, and who is closest to closing them?",
        "Log a win for Hannah Kim: she ran the Kestrel Insurance AI workshop yesterday with 12 attendees.",
        "Who on the team is aiming for a manager role, and do their dev plans support it?",
        "Draft a promotion case for Priya Nair to Principal SA.",
        "Give Priya Nair a shout-out for mentoring the two new SAs through their first POCs.",
        "Mei Chen accepted the counter-offer. Lower her retention risk to medium.",
      ]
    : [
        "Log a win: I presented the Harbour Bank architecture at the APJ field call today.",
        "Send Hannah Kim a shout-out for jumping in on my Aurora Logistics demo at short notice.",
        "Update Aurora Logistics: POC success criteria signed off, so the technical win is secured. Next step is the commercial proposal with Tama on Friday.",
        "What skills should I focus on next quarter?",
        "How is my development plan tracking?",
        "Change my career goal to Field CTO: I want to stay technical but work with execs.",
        "What is Tom Becker's retention risk?",
      ];
}

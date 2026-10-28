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
        "Who is overloaded and who has room to take Pacific Media Group?",
        "Plan an AI Gateway workshop for Liam O'Connor with Brightside Energy on the 20th, 6 hours.",
        "Draft a promotion case for Priya Nair to Principal SA.",
        "Give Priya Nair a shout-out for mentoring the two new SAs through their first POCs.",
        "Mei Chen accepted the counter-offer. Lower her retention risk to medium.",
        "What in the Library should Grace and Daniel reuse on Coral Airlines?",
        "Coral Airlines is weighing up AWS Amplify. How should Daniel position against it?",
        "Which renewals should we focus on this quarter, and what can we upsell?",
        "What workshops should we run next quarter, and who should we invite?",
      ]
    : [
        "Log a win: I presented the Harbour Bank architecture at the APJ field call today.",
        "Send Hannah Kim a shout-out for jumping in on my Aurora Logistics demo at short notice.",
        "Update Aurora Logistics: POC success criteria signed off, so the technical win is secured. Next step is the commercial proposal with Tama on Friday.",
        "I used the AI service agent demo script on Aurora Logistics. Log it in the Library.",
        "Aurora Logistics is also looking at Netlify. Record it and tell me how to position.",
        "How is Northshore Bank adopting Vercel, and who could be our champion there?",
        "What skills should I focus on next quarter?",
        "How is my development plan tracking?",
        "Change my career goal to Field CTO: I want to stay technical but work with execs.",
      ];
}

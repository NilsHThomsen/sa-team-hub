import Link from "next/link";
import { cachedBattlecards } from "@/lib/cached";
import { PageHeader, Section, Stat } from "../_ui";
import { dealCount } from "./_parts";

// Like the Library, nothing here depends on who is looking, so the page and its data
// are part of the prerendered shell served from Vercel's CDN; proxy.ts checks the
// sign-in before the cache. See cachedBattlecards().
export default async function CompetePage() {
  const cards = await cachedBattlecards();
  const open = cards.reduce((n, c) => n + c.open_deals, 0);
  const won = cards.reduce((n, c) => n + c.won_deals, 0);
  const [mostSeen] = [...cards].sort((a, b) => b.open_deals - a.open_deals);

  return (
    <>
      <PageHeader
        subtitle="Battlecards for the competitors we meet most. The same for everyone, so this page is served from Vercel's CDN."
        title="Compete"
      />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Battlecards" value={cards.length} />
        <Stat label="Open deals with a competitor" value={open} />
        <Stat label="Won against them" value={won} />
        <Stat label="Seen most" value={mostSeen ? <span className="text-lg">{mostSeen.competitor.split(" (")[0]}</span> : "–"} />
      </div>

      <Section note="Open one for where they win, where we win, questions and objections" title="Battlecards">
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((c) => (
            <Link
              className="group space-y-2 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30"
              href={`/compete/${c.id}`}
              key={c.id}
              prefetch
            >
              <div className="font-medium group-hover:underline">{c.competitor}</div>
              <p className="text-muted-foreground text-sm">{c.positioning}</p>
              <div className="text-muted-foreground text-xs">
                {dealCount(c)} · {c.owner} · reviewed {c.reviewed_on}
              </div>
            </Link>
          ))}
        </div>
      </Section>
      <p className="text-muted-foreground text-xs">
        Ask the agent for positioning on a deal, for example "Coral Airlines is also looking at Netlify. How do I position?"
      </p>
    </>
  );
}

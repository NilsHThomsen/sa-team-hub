import type { Battlecard } from "@/agent/lib/data";

/** Counts only: SAs see just their own deals on Deal Coverage. */
export function dealCount(card: Pick<Battlecard, "open_deals" | "won_deals">): string {
  const open = card.open_deals === 0 ? "No open deals" : `On ${card.open_deals} open deal${card.open_deals === 1 ? "" : "s"}`;
  return card.won_deals > 0 ? `${open}, won ${card.won_deals}` : open;
}

export function Points({ title, items, tone }: { readonly title: string; readonly items: readonly string[]; readonly tone?: "them" | "us" }) {
  return (
    <div className={tone === "us" ? "space-y-2 rounded-xl border border-emerald-300/60 bg-card p-4" : "space-y-2 rounded-xl border bg-card p-4"}>
      <h2 className="font-medium">{title}</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground text-sm leading-relaxed">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cachedBattlecards, cachedLibrary } from "@/lib/cached";
import { Section, Table, Td } from "../../_ui";
import { dealCount, Points } from "../_parts";

// One battlecard, prerendered at build time and served from the CDN, like a Library
// architecture page.
export async function generateStaticParams() {
  const cards = await cachedBattlecards();
  // Cache Components needs at least one param. A build without a database gets a
  // placeholder, which 404s.
  return cards.length > 0 ? cards.map((c) => ({ slug: c.id })) : [{ slug: "__placeholder__" }];
}

export default function BattlecardPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div aria-busy className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <Battlecard params={params} />
    </Suspense>
  );
}

async function Battlecard({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [cards, { architectures, assets }] = await Promise.all([cachedBattlecards(), cachedLibrary()]);
  const card = cards.find((c) => c.id === slug);
  if (!card) notFound();
  // Library items to demo: architectures open their page, assets their file.
  const proof = card.proof.flatMap((id) => {
    const arch = architectures.find((a) => a.id === id);
    if (arch) return [{ id, title: arch.title, href: `/library/${id}`, file: false }];
    const asset = assets.find((a) => a.id === id);
    return asset ? [{ id, title: asset.title, href: asset.href, file: true }] : [];
  });

  return (
    <>
      <Link className="text-muted-foreground text-sm underline-offset-2 hover:underline" href="/compete">
        ← Compete
      </Link>
      <div className="mt-3 mb-6 space-y-2">
        <h1 className="font-semibold text-2xl tracking-tight">{card.competitor}</h1>
        <p className="text-muted-foreground">{card.positioning}</p>
        <div className="text-muted-foreground text-xs">
          Owned by {card.owner} · reviewed {card.reviewed_on} · {dealCount(card)}
        </div>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Points items={card.they_win} title="Where they win" />
        <Points items={card.we_win} title="Where we win" tone="us" />
      </div>

      <Section note="Ask early; each one surfaces a gap" title="Discovery questions">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          {card.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </Section>

      <Section title="Objections">
        <Table head={["They say", "We say"]}>
          {card.objections.map((o) => (
            <tr key={o.objection}>
              <Td className="w-1/3 font-medium">{`"${o.objection}"`}</Td>
              <Td className="text-muted-foreground">{o.answer}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      {proof.length > 0 ? (
        <Section note="From the Library" title="Show, don't tell">
          <ul className="space-y-1.5 text-sm">
            {proof.map((p) => (
              <li key={p.id}>
                {p.file ? (
                  <a className="font-medium underline-offset-2 hover:underline" href={p.href} rel="noreferrer" target="_blank">
                    {p.title}
                  </a>
                ) : (
                  <Link className="font-medium underline-offset-2 hover:underline" href={p.href} prefetch>
                    {p.title}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section note="Check them before quoting a number" title="Sources">
        <ul className="space-y-1.5 text-sm">
          {card.sources.map((s) => (
            <li key={s.url}>
              <a className="underline-offset-2 hover:underline" href={s.url} rel="noreferrer" target="_blank">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

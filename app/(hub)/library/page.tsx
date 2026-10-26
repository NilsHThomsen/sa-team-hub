import Image from "next/image";
import Link from "next/link";
import { ASSET_KIND_LABEL } from "@/agent/lib/data";
import { cachedLibrary } from "@/lib/cached";
import { PageHeader, Section, Stat, Table, Td } from "../_ui";
import { DIAGRAMS } from "./_diagrams";
import { Products, usedOn } from "./_parts";

// Unlike the other tabs, nothing here depends on who is looking: no cookies, no role.
// So the page and its data are part of the prerendered shell served from Vercel's CDN
// (only the layout's tabs and name stream in), and the sign-in check happens in
// proxy.ts before the cache. See cachedLibrary().
export default async function LibraryPage() {
  const { architectures, assets } = await cachedLibrary();
  const items = [...architectures, ...assets];
  const reuses = items.reduce((n, item) => n + item.uses.length, 0);
  const titleOf = new Map(architectures.map((a) => [a.id, a.title]));

  // Reuse of what someone contributed: an SA excellence measure for shared IP.
  const byAuthor = new Map<string, number>();
  for (const item of items) byAuthor.set(item.author, (byAuthor.get(item.author) ?? 0) + item.uses.length);
  const [top] = [...byAuthor].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        subtitle="Reference architectures and demo assets the team reuses on deals. The same for everyone, so this page is served from Vercel's CDN."
        title="Library"
      />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Reference architectures" value={architectures.length} />
        <Stat label="Demo assets" value={assets.length} />
        <Stat label="Reuses on deals" value={reuses} />
        <Stat label="Most reused contributor" value={top ? <span className="text-lg">{top[0]}</span> : "–"} />
      </div>

      <Section note="Open one for the diagram, approach and watch-outs" title="Reference architectures">
        <div className="grid gap-4 md:grid-cols-2">
          {architectures.map((a) => (
            <Link
              className="group overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/30"
              href={`/library/${a.id}`}
              key={a.id}
              prefetch
            >
              {DIAGRAMS[a.id] ? (
                <Image
                  alt={`${a.title} diagram`}
                  className="h-auto w-full border-b"
                  placeholder="blur"
                  sizes="(min-width: 768px) 560px, 100vw"
                  src={DIAGRAMS[a.id]}
                />
              ) : null}
              <div className="space-y-2 p-4">
                <div className="font-medium group-hover:underline">{a.title}</div>
                <p className="text-muted-foreground text-sm">{a.summary}</p>
                <Products items={a.products} />
                <div className="text-muted-foreground text-xs">
                  {a.author} · {usedOn(a.uses)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section note="Files are served straight from the CDN" title="Demo assets">
        <Table head={["Asset", "Type", "Goes with", "By", "Reuse"]}>
          {assets.map((asset) => (
            <tr key={asset.id}>
              <Td>
                <a className="font-medium underline-offset-2 hover:underline" href={asset.href} rel="noreferrer" target="_blank">
                  {asset.title}
                </a>
                <div className="text-muted-foreground text-xs">{asset.description}</div>
              </Td>
              <Td className="whitespace-nowrap">{ASSET_KIND_LABEL[asset.kind]}</Td>
              <Td>
                {asset.architecture_id ? (
                  <Link className="underline-offset-2 hover:underline" href={`/library/${asset.architecture_id}`} prefetch>
                    {titleOf.get(asset.architecture_id)}
                  </Link>
                ) : (
                  "–"
                )}
              </Td>
              <Td className="whitespace-nowrap">{asset.author}</Td>
              <Td className="whitespace-nowrap text-muted-foreground">{usedOn(asset.uses)}</Td>
            </tr>
          ))}
        </Table>
      </Section>
      <p className="text-muted-foreground text-xs">Ask the agent to log a reuse, for example "I used the peak load demo script on Coral Airlines".</p>
    </>
  );
}

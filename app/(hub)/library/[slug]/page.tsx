import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ASSET_KIND_LABEL } from "@/agent/lib/data";
import { cachedLibrary } from "@/lib/cached";
import { Section, Table, Td } from "../../_ui";
import { DIAGRAMS } from "../_diagrams";
import { Products, usedOn } from "../_parts";

// One reference architecture. Every architecture is prerendered at build time and
// served from the CDN; one added later is rendered on its first visit and cached from
// then on (ISR). Like the Library page, it reads nothing personal.
export async function generateStaticParams() {
  const { architectures } = await cachedLibrary();
  // Cache Components needs at least one param. A build without a database gets a
  // placeholder, which 404s.
  return architectures.length > 0 ? architectures.map((a) => ({ slug: a.id })) : [{ slug: "__placeholder__" }];
}

export default function ArchitecturePage({ params }: { readonly params: Promise<{ slug: string }> }) {
  // params is awaited inside the boundary, so an architecture added after the build
  // still gets an instant shell (see the ISR with Cache Components guide).
  return (
    <Suspense fallback={<div aria-busy className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <Architecture params={params} />
    </Suspense>
  );
}

async function Architecture({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { architectures, assets } = await cachedLibrary();
  const arch = architectures.find((a) => a.id === slug);
  if (!arch) notFound();
  const related = assets.filter((a) => a.architecture_id === arch.id);

  return (
    <>
      <Link className="text-muted-foreground text-sm underline-offset-2 hover:underline" href="/library">
        ← Library
      </Link>
      <div className="mt-3 mb-6 space-y-2">
        <h1 className="font-semibold text-2xl tracking-tight">{arch.title}</h1>
        <p className="text-muted-foreground">{arch.summary}</p>
        <div className="text-muted-foreground text-xs">
          By {arch.author} · updated {arch.updated_on} · {usedOn(arch.uses)}
        </div>
      </div>

      {DIAGRAMS[arch.id] ? (
        <Image
          alt={`${arch.title} diagram`}
          className="mb-8 h-auto w-full rounded-xl border"
          placeholder="blur"
          fetchPriority="high"
          sizes="(min-width: 1152px) 1120px, 100vw"
          src={DIAGRAMS[arch.id]}
        />
      ) : null}

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <Part title="The problem">{arch.problem}</Part>
        <Part title="When to use it">{arch.when_to_use}</Part>
        <Part title="The approach">{arch.approach}</Part>
        <Part title="Watch-outs">{arch.watch_outs}</Part>
      </div>

      <Section title="Vercel products">
        <Products items={arch.products} />
      </Section>

      {related.length > 0 ? (
        <Section title="Demo assets">
          <ul className="space-y-2 text-sm">
            {related.map((asset) => (
              <li key={asset.id}>
                <a className="font-medium underline-offset-2 hover:underline" href={asset.href} rel="noreferrer" target="_blank">
                  {asset.title}
                </a>{" "}
                <span className="text-muted-foreground">
                  ({ASSET_KIND_LABEL[asset.kind]}, {asset.author}): {asset.description}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Used on">
        {arch.uses.length === 0 ? (
          <p className="text-muted-foreground text-sm">Not used on a deal yet.</p>
        ) : (
          <Table head={["Deal", "By", "When"]}>
            {arch.uses.map((use) => (
              <tr key={use.deal_id}>
                <Td>{use.account}</Td>
                <Td>{use.used_by}</Td>
                <Td className="whitespace-nowrap">{use.used_on}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}

function Part({ title, children }: { readonly title: string; readonly children: string }) {
  return (
    <div className="space-y-1">
      <h2 className="font-medium">{title}</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">{children}</p>
    </div>
  );
}

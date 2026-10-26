import type { LibraryUse } from "@/agent/lib/data";

export function Products({ items }: { readonly items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((p) => (
        <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-muted-foreground text-xs ring-1 ring-border" key={p}>
          {p}
        </span>
      ))}
    </div>
  );
}

export function usedOn(uses: readonly LibraryUse[]): string {
  if (uses.length === 0) return "Not used on a deal yet";
  return `Used on ${uses.length} deal${uses.length === 1 ? "" : "s"}`;
}

import { Table, Td } from "../_ui";

// One-glance summary of the battlecards: how we win, and where we're weak.
// Every cell comes from a battlecard, so the sources live there. Static, so it is part
// of the prerendered shell like the rest of the page.
type Rating = "strength" | "watch" | "risk" | "none";
type Cell = readonly [Rating, string];

const VENDORS = ["Vercel", "AWS (Amplify)", "Netlify", "Cloudflare"] as const;

const ROWS: readonly { readonly topic: string; readonly cells: readonly [Cell, Cell, Cell, Cell] }[] = [
  {
    topic: "Next.js",
    cells: [
      ["strength", "Native, current release on day one"],
      ["watch", "Docs cover Next.js 12 to 15"],
      ["watch", "OpenNext adapter; most features supported"],
      ["risk", "Adapter: no Node.js middleware; PPR and \"use cache\" experimental"],
    ],
  },
  {
    topic: "Fresh content",
    cells: [
      ["strength", "Purge by tag globally in about 300 ms"],
      ["risk", "No on-demand ISR, so changes wait for a timer"],
      ["watch", "Purges take a few seconds (Vercel's guide)"],
      ["watch", "Build the cache yourself from R2, Durable Objects and D1"],
    ],
  },
  {
    topic: "AI and long work",
    cells: [
      ["strength", "Streaming, up to 800 s, AI Gateway, Workflow and eve"],
      ["risk", "No Next.js streaming; Bedrock AI kit in Amplify Gen 2"],
      ["risk", "60 s sync function limit; AI Gateway in beta"],
      ["watch", "128 MB per isolate and a 10 MB bundle"],
    ],
  },
  {
    topic: "Price to start",
    cells: [
      ["watch", "Active CPU billing; compare on the workload at peak"],
      ["strength", "Free tier, then $0.15 per GB and $0.30 per million requests"],
      ["strength", "Pro is $20 a month on credits"],
      ["strength", "Workers Paid $5 a month with 10M requests; no R2 egress"],
    ],
  },
  {
    topic: "Network and security",
    cells: [
      ["watch", "Framework-aware WAF, rules live in under 300 ms; smaller network"],
      ["none", "Not compared on the battlecard"],
      ["none", "Not compared on the battlecard"],
      ["strength", "330+ cities, deepest WAF and bot scoring"],
    ],
  },
  {
    topic: "Incumbency",
    cells: [
      ["watch", "Often the new vendor; on AWS Marketplace"],
      ["strength", "On the AWS bill and existing security review"],
      ["strength", "Often already hosts the marketing site"],
      ["none", "Ask whether it already proxies the site"],
    ],
  },
];

const DOT: Record<Rating, string> = { strength: "bg-good", watch: "bg-warn", risk: "bg-bad", none: "bg-muted-foreground/30" };
const LABEL: Record<Rating, string> = { strength: "Strength", watch: "Watch-out", risk: "Risk", none: "Not rated" };

function Rated({ cell: [rating, text] }: { readonly cell: Cell }) {
  return (
    <div className="flex gap-2">
      <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[rating]}`} />
      <span className={rating === "none" ? "text-muted-foreground" : undefined}>
        <span className="sr-only">{LABEL[rating]}: </span>
        {text}
      </span>
    </div>
  );
}

export function WinLoseMatrix() {
  return (
    <>
      <Table head={["", ...VENDORS]}>
        {ROWS.map((r) => (
          <tr key={r.topic}>
            <Td className="whitespace-nowrap text-muted-foreground">{r.topic}</Td>
            {r.cells.map((c, i) => (
              <Td className={i === 0 ? "font-medium" : undefined} key={VENDORS[i]}>
                <Rated cell={c} />
              </Td>
            ))}
          </tr>
        ))}
      </Table>
      <div className="mt-2 flex flex-wrap gap-4 text-muted-foreground text-xs">
        {(["strength", "watch", "risk"] as const).map((r) => (
          <span className="flex items-center gap-1.5" key={r}>
            <span aria-hidden className={`size-2 rounded-full ${DOT[r]}`} />
            {LABEL[r]}
          </span>
        ))}
      </div>
    </>
  );
}

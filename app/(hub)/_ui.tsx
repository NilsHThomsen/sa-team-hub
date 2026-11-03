import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { readonly title: string; readonly subtitle?: string; readonly actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Section({ title, children, note }: { readonly title: string; readonly children: ReactNode; readonly note?: string }) {
  return (
    <section className="mb-8 space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-medium text-lg">{title}</h2>
        {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
  href,
}: { readonly label: string; readonly value: ReactNode; readonly tone?: "neutral" | "good" | "warn" | "bad"; readonly href?: string }) {
  const body = (
    <>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          "mt-1 font-semibold text-2xl tabular-nums",
          tone === "good" && "text-good",
          tone === "warn" && "text-warn",
          tone === "bad" && "text-bad",
        )}
      >
        {value}
      </div>
    </>
  );
  if (!href) return <div className="rounded-xl border bg-card p-4">{body}</div>;
  return (
    <Link className="block rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted/40" href={href}>
      {body}
    </Link>
  );
}

const PILL: Record<string, string> = {
  high: "bg-bad-soft text-bad",
  medium: "bg-warn-soft text-warn",
  low: "bg-good-soft text-good",
  on_track: "bg-good-soft text-good",
  at_risk: "bg-warn-soft text-warn",
  overdue: "bg-bad-soft text-bad",
  done: "bg-muted text-foreground",
  complete: "bg-good-soft text-good",
  in_progress: "bg-warn-soft text-warn",
  not_started: "bg-muted text-muted-foreground",
  next_focus: "bg-card text-warn ring-1 ring-warn/60",
  pending_approval: "bg-warn-soft text-warn",
  approved: "bg-good-soft text-good",
  rejected: "bg-muted text-muted-foreground",
  pending: "bg-warn-soft text-warn",
  accepted: "bg-good-soft text-good",
  declined: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

export function Pill({ value, label }: { readonly value: string; readonly label?: string }) {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs", PILL[value] ?? "bg-muted text-foreground")}>
      {label ?? value.replaceAll("_", " ")}
    </span>
  );
}

export function Table({ head, children }: { readonly head: readonly string[]; readonly children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground text-xs">
          <tr>
            {head.map((h) => (
              <th className="whitespace-nowrap px-3 py-2 font-medium" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, colSpan, rowSpan }: { readonly children?: ReactNode; readonly className?: string; readonly colSpan?: number; readonly rowSpan?: number }) {
  return (
    <td className={cn("px-3 py-2 align-top", className)} colSpan={colSpan} rowSpan={rowSpan}>
      {children}
    </td>
  );
}

export function ManagerOnly() {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground text-sm">
      This page is for managers only.
    </div>
  );
}


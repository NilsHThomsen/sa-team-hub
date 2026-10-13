import Link from "next/link";
import type { ReactNode } from "react";
import { requireActor } from "@/lib/viewer";
import { signOut } from "../login/actions";

export default async function HubLayout({ children }: { readonly children: ReactNode }) {
  const { viewer } = await requireActor();
  const nav = [
    { href: "/", label: "Home" },
    { href: "/skills", label: "Skills Matrix" },
    { href: "/achievements", label: "Achievements" },
    { href: "/dev-plans", label: "Dev Plans" },
    { href: "/deals", label: "Deal Coverage" },
    // Hidden for ICs; the page and the data layer refuse them anyway.
    ...(viewer.role === "manager" ? [{ href: "/talent", label: "Talent" }] : []),
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link className="font-semibold tracking-tight" href="/">
            SA Team Hub
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {nav.map((item) => (
              <Link className="text-muted-foreground hover:text-foreground" href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground" href="/s">
              Ask the agent
            </Link>
            <span className="text-muted-foreground">
              {viewer.name} · {viewer.role === "manager" ? "Manager" : "IC"}
            </span>
            <form action={signOut}>
              <button className="text-muted-foreground underline-offset-2 hover:underline" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

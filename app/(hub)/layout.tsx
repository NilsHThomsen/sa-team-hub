import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { examplePrompts } from "@/lib/examples";
import { requireActor } from "@/lib/viewer";
import { signOut } from "../login/actions";
import { AskAgent } from "./_ask-agent";
import { NavLinks } from "./_nav";

// Cache Components: every hub page reads the sign-in cookie and shows that person's data, so this route renders at request time.
// `instant = false` allows that (the documented opt-out); cached pieces such
// as the weekly digest still opt in with "use cache".
export const instant = false;

export default async function HubLayout({ children }: { readonly children: ReactNode }) {
  const { viewer } = await requireActor();
  const nav = [
    { href: "/", label: "Home" },
    { href: "/achievements", label: "Achievements" },
    { href: "/skills", label: "Skills Matrix" },
    { href: "/dev-plans", label: "Dev Plans" },
    { href: "/deals", label: "Deal Coverage" },
    // Hidden for ICs; the page and the data layer refuse them anyway.
    ...(viewer.role === "manager"
      ? [
          { href: "/talent", label: "Talent" },
          { href: "/usage", label: "AI Usage" },
          { href: "/settings", label: "Settings" },
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link className="font-semibold tracking-tight" href="/">
            SA Team Hub
          </Link>
          <Suspense>
            <NavLinks items={nav} />
          </Suspense>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <AskAgent examples={examplePrompts(viewer.role)} />
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

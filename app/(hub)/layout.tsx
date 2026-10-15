import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { examplePrompts } from "@/lib/examples";
import { requireActor } from "@/lib/viewer";
import { signOut } from "../login/actions";
import { AskAgent } from "./_ask-agent";
import { NavLinks } from "./_nav";

// Cache Components: the layout itself reads nothing personal, so every hub page
// gets a prerendered shell (the header frame and a loading skeleton) served from
// Vercel's CDN, and Partial Prefetching fetches that shell before a click.
// Everything that reads the sign-in cookie (the role-based nav, the agent panel
// and the page itself) sits inside a Suspense boundary and streams in from the
// function at request time. A signed-out request still redirects to /login.
// Each tab's loading.tsx adds its real heading to that shell (see PageLoading).
export default function HubLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link className="font-semibold tracking-tight" href="/">
            SA Team Hub
          </Link>
          <Suspense fallback={<div aria-hidden className="h-5 w-72 animate-pulse rounded bg-muted" />}>
            <ViewerNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Suspense fallback={<div aria-hidden className="h-5 w-40 animate-pulse rounded bg-muted" />}>
              <ViewerControls />
            </Suspense>
            {/* Same for everyone, so it is part of the prerendered shell. */}
            <form action={signOut}>
              <button className="text-muted-foreground underline-offset-2 hover:underline" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </main>
    </div>
  );
}

/** The tabs: managers see Talent, AI Usage and Settings as well. */
async function ViewerNav() {
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
  return <NavLinks items={nav} />;
}

/**
 * The agent panel and the name. The panel stays out of the shared shell on purpose:
 * its suggested prompts are chosen by role, and manager prompts must never reach an SA.
 */
async function ViewerControls() {
  const { viewer } = await requireActor();
  return (
    <>
      <AskAgent examples={examplePrompts(viewer.role)} />
      <span className="text-muted-foreground">
        {viewer.name} · {viewer.role === "manager" ? "Manager" : "IC"}
      </span>
    </>
  );
}

/** Shown in the prerendered shell until the page's own data streams in. */
function PageSkeleton() {
  return (
    <div aria-busy className="space-y-4">
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

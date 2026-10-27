import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { examplePrompts } from "@/lib/examples";
import { getViewer, requireActor } from "@/lib/viewer";
import { signOut } from "../login/actions";
import { AskAgent } from "./_ask-agent";
import { NavLinks } from "./_nav";

// Cache Components: the layout itself reads nothing personal, so every hub page
// gets a prerendered shell (the header frame and a loading skeleton) served from
// Vercel's CDN, and Partial Prefetching fetches that shell before a click.
// Everything that reads the sign-in cookie (the role-based nav, the agent's prompts
// and the page itself) sits inside a Suspense boundary and streams in from the
// function at request time. A signed-out request still redirects to /login.
// Tabs have no loading.tsx on purpose: on a click, the page you're on stays up
// until the next one is ready (often straight from the browser's private cache),
// instead of flashing a skeleton. A first, full page load shows PageSkeleton.
export default function HubLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link className="font-semibold tracking-tight" href="/">
            SA Team Hub
          </Link>
          <Suspense fallback={<div aria-hidden className="order-last h-5 w-72 animate-pulse rounded bg-muted sm:order-none" />}>
            <ViewerNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {/* The button is in the shell; its role-based prompts stream in (see _ask-agent.tsx). */}
            <AskAgent examples={roleExamples()} />
            <Suspense fallback={<div aria-hidden className="hidden h-5 w-32 animate-pulse rounded bg-muted sm:block" />}>
              <ViewerName />
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
    { href: "/deals", label: "Deal Coverage" },
    { href: "/accounts", label: "Accounts" },
    { href: "/dev-plans", label: "Dev Plans" },
    { href: "/skills", label: "Skills Matrix" },
    { href: "/achievements", label: "Achievements" },
    { href: "/library", label: "Library" },
    { href: "/compete", label: "Compete" },
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

/** The signed-in person's name and role. */
async function ViewerName() {
  const { viewer } = await requireActor();
  return (
    // Hidden on a phone to keep the header to one row; the name is on Home anyway.
    <span className="hidden text-muted-foreground sm:inline">
      {viewer.name} · {viewer.role === "manager" ? "Manager" : "IC"}
    </span>
  );
}

/**
 * The chat panel's suggested prompts, chosen by role. Not awaited by the layout: the promise is
 * passed to the client and resolved per request, so manager prompts never reach an SA's browser.
 */
async function roleExamples(): Promise<readonly string[]> {
  const viewer = await getViewer();
  return viewer ? examplePrompts(viewer.role) : [];
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

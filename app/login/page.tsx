import { cachedPeople } from "@/lib/cached";
import { connection } from "next/server";
import { Suspense } from "react";

import { signIn } from "./actions";

// Cache Components: the form is prerendered and served from the CDN. The
// people list (from Postgres) and the error (from the URL) stream in behind
// Suspense.
export const instant = false;

type SearchParams = Promise<{ error?: string }>;

export default function LoginPage({ searchParams }: { readonly searchParams: SearchParams }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form action={signIn} className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">SA Team Hub</h1>
          <p className="text-muted-foreground text-sm">Demo sign-in. Apart from the manager, every name in this app is fictional.</p>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Sign in as</span>
          <Suspense fallback={<div aria-hidden className="h-[42px] animate-pulse rounded-md bg-muted" />}>
            <PeopleSelect />
          </Suspense>
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Demo password</span>
          <input className="w-full rounded-md border bg-background px-3 py-2" name="password" required type="password" />
        </label>

        <Suspense fallback={null}>
          <SignInError searchParams={searchParams} />
        </Suspense>

        <button className="w-full rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm" type="submit">
          Sign in
        </button>

        <p className="text-muted-foreground text-xs">
          Try Nils Thomsen to see the manager view, then Priya Nair to see what an IC can and cannot see.
        </p>
      </form>
    </main>
  );
}

async function PeopleSelect() {
  // Wait for the request before touching Postgres, so the build never queries it.
  await connection();
  const people = await cachedPeople();
  return (
    <select className="w-full rounded-md border bg-background px-3 py-2" defaultValue="jordan-hayes" name="personId">
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.role === "manager" ? "Manager" : p.title})
        </option>
      ))}
    </select>
  );
}

async function SignInError({ searchParams }: { readonly searchParams: SearchParams }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p className="text-destructive text-sm" role="alert">
      {error === "password" ? "That password is not right." : "Pick a person from the list."}
    </p>
  );
}

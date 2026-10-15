import { connection } from "next/server";
import { listPeople } from "@/agent/lib/data";
import { signIn } from "./actions";

// Cache Components: the sign-in page reads the error from the URL and the people list from Postgres, so this route renders at request time.
// `instant = false` allows that (the documented opt-out); cached pieces such
// as the weekly digest still opt in with "use cache".
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  // Wait for the request before touching Postgres, so the build never queries it.
  await connection();
  const [{ error }, people] = await Promise.all([searchParams, listPeople()]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form action={signIn} className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">SA Team Hub</h1>
          <p className="text-muted-foreground text-sm">Demo sign-in. Apart from the manager, every name in this app is fictional.</p>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Sign in as</span>
          <select className="w-full rounded-md border bg-background px-3 py-2" defaultValue="jordan-hayes" name="personId">
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.role === "manager" ? "Manager" : p.title})
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Demo password</span>
          <input className="w-full rounded-md border bg-background px-3 py-2" name="password" required type="password" />
        </label>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error === "password" ? "That password is not right." : "Pick a person from the list."}
          </p>
        ) : null}

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

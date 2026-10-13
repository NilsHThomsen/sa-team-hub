import postgres from "postgres";

// One lazily created client per function instance. On Vercel Fluid compute an
// instance serves many concurrent requests, so a small shared pool is reused
// instead of opening a connection per request. Lazy creation keeps `next build`
// and `eve build` working without database credentials.
let client: postgres.Sql | undefined;

export function db(): postgres.Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Connect a Neon database to the Vercel project.");
  client = postgres(url, {
    ssl: url.includes("localhost") ? false : "require",
    max: 5,
    idle_timeout: 20,
    onnotice: () => {},
  });
  return client;
}

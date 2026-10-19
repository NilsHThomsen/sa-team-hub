import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // Cache Components: everything renders at request time unless it opts into
  // caching with "use cache". Shared reads use "use cache: remote" (the digest in
  // app/(hub)/page.tsx, the rest in lib/cached.ts); personal pages use
  // "use cache: private" so they're only cached in the viewer's browser. See README.
  cacheComponents: true,
  // Set explicitly as the docs ask: the router prefetches each route's App Shell.
  partialPrefetching: true,
};

export default withEve(nextConfig);

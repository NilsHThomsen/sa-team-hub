import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // Cache Components: everything renders at request time unless it opts into
  // caching with "use cache". Only the weekly digest does so far (app/(hub)/page.tsx).
  cacheComponents: true,
  // Set explicitly as the docs ask: the router prefetches each route's App Shell.
  partialPrefetching: true,
};

export default withEve(nextConfig);

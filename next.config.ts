import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Section pages are all dynamic (each reads the session cookie via
    // requireUser), so by default the client cache discards them the instant
    // you navigate away — switching back to a tab you just left costs a full
    // server round-trip plus its DB queries again. This app's navigation is
    // tab-based: users bounce between the same handful of sections, so caching
    // a recently-rendered section for a short window makes switching back feel
    // instant. `dynamic` covers those cookie-gated pages; `static` extends the
    // reuse window for prefetched loading skeletons.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;

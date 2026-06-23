import type { NextConfig } from "next";

// Baseline hardening headers applied to every response. Deliberately no CSP:
// the App Router injects inline styles/scripts without a nonce here, so a strict
// CSP would break the page — the headers below cover the high-value, low-risk
// protections (clickjacking, MIME sniffing, referrer/permissions leakage, HSTS).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  images: {
    // Company logos come from arbitrary employer domains + provider CDNs, so the
    // remote host can't be pinned to a fixed list. SVGs stay disabled (default)
    // so the optimizer can't be used to serve active content.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

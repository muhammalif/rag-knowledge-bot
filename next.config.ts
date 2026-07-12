import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack workspace root to this project dir — silences the
  // "multiple lockfiles / inferred workspace root" warning when a parent
  // directory (e.g. ~/package-lock.json) also has a lockfile.
  turbopack: {
    root: import.meta.dirname,
  },
  // Keep Langfuse/OpenTelemetry Node-only packages out of the Turbopack bundle
  // (they touch Node internals like dns / async_hooks).
  serverExternalPackages: [
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/sdk-trace-base",
    "@langfuse/otel",
    "@langfuse/langchain",
    "@langfuse/tracing",
    "@langfuse/core",
  ],
};

export default nextConfig;

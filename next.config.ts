import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent `next dev`/`next build` from appending vendor agent-guidance
  // blocks into CLAUDE.md — this repo's CLAUDE.md is hand-authored.
  agentRules: false,
};

export default nextConfig;

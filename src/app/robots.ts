import type { MetadataRoute } from "next";

// Search engines may index the site; AI training/answer crawlers may not.
// Only binds crawlers that honour robots.txt — the photographs' actual
// protection is LICENSE plus the authorship metadata in every file.
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "PerplexityBot",
  "Meta-ExternalAgent",
  "Amazonbot",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: "/" },
    ],
  };
}

import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";
import "./globals.css";
import LandingComposition from "@/motion/LandingComposition";
import { getFeaturedPhotos } from "@/data/photos";

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SUQUIA — Javier Suquia Photography",
  description: "Photography portfolio of Javier Suquia.",
  // Stops mobile Safari from auto-linking things that look like phone
  // numbers/dates (e.g. the "01", "02"... photo numbers) into blue,
  // underlined tel:/date links.
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Rendered here rather than from app/page.tsx so it mounts once for the
  // whole app session and never unmounts on navigation — its GL scene
  // (WebGL context, decoded/uploaded textures) and Lenis instance would
  // otherwise be torn down and rebuilt every time the user leaves "/" and
  // comes back. It stays hidden (display: none) on every other route; see
  // its own `active` handling for how that's driven. app/page.tsx renders
  // nothing itself — this is the landing's real, persistent home.
  const landingPhotos = getFeaturedPhotos();

  return (
    <html lang="en" className={`${ebGaramond.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LandingComposition photos={landingPhotos} />
        {children}
      </body>
    </html>
  );
}

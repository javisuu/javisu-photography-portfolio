import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";
import "./globals.css";

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
  return (
    <html lang="en" className={`${ebGaramond.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

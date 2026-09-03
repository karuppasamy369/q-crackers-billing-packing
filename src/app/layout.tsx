import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Q Crackers — Internal Console",
  description: "Internal operations console for Q Crackers.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}

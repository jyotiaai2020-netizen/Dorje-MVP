import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: `${process.env.NEXT_PUBLIC_APP_TITLE || "Dorje AI"} — Your Secure AI Workspace | Lotus & Dorje`,
  description: "One secure workspace for thinking, studying, working, organizing, creating, and growing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

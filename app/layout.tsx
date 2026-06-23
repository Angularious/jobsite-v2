import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Search — meet the team behind any role",
  description: "Search a role, find live job postings, and meet the people and recruiters behind them.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-base text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

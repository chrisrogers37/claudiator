import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "claudefather",
  description: "Skill registry and distribution platform for Claude Code",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0d1117] text-gray-200 antialiased">
        {children}
      </body>
    </html>
  );
}

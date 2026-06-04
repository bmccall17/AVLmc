import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AVLgo Music Companion",
  description: "Upcoming Asheville shows from AVLgo, organized for quick discovery."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

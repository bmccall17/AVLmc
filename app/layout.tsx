import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://avlmc.vercel.app"),
  title: "AVL Music Companion",
  description: "Upcoming Asheville shows from AVLgo, with local notes and listening signals."
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

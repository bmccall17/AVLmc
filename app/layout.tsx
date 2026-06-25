import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://avlmc.vercel.app"),
  title: "AVL Music Companion",
  description: "Upcoming Asheville shows from AVLgo, with local notes and listening signals.",
  // Canonical icon lives in public/icon.png and is served at /icon.png (the same URL the UI
  // references via next/image). Declaring it here keeps the favicon working without an
  // app/icon.png metadata route, which collided with the public asset and 500'd /icon.png.
  icons: { icon: "/icon.png" }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Script
            src="https://cloud.umami.is/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}

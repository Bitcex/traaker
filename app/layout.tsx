import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/Providers";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Traak Sports Terminal",
  description: "Polymarket sports trading terminal and analytics layer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Script id="traak-theme-init" strategy="beforeInteractive">{`
          try {
            window.localStorage.removeItem('traak-theme');
            document.documentElement.dataset.theme = 'dark';
          } catch (error) {}
        `}</Script>
        <Providers>
          <div className="traak-shell min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            <AppNav />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

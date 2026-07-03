import type { Metadata } from "next";
import localFont from "next/font/local";
import { ClerkProvider } from "@clerk/nextjs";
import { TrpcProvider } from "@/components/TrpcProvider";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Listero — your AI financial co-pilot",
  description:
    "Real-time purchase categorization for solo creative businesses. Every transaction explained, confirmed with one tap in Slack.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        variables: { colorPrimary: "#E8604C" },
      }}
      signInUrl="/login"
      signUpUrl="/signup"
    >
      <html lang="en">
        <body className={`${geistSans.variable} font-sans antialiased bg-cream text-ink min-h-screen`}>
          <TrpcProvider>
            <SiteHeader />
            {children}
          </TrpcProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

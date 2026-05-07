import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Gavel — The AI oracle that calls it",
  description:
    "Pay-per-query AI oracle for prediction markets. Resolves disputes in 30 seconds for $0.50, settled on Base. Built with Coinbase x402 + AWS Lambda + Bedrock.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/gavel_logo.png", sizes: "any" },
    ],
    apple: "/gavel_logo.png",
  },
  openGraph: {
    title: "Gavel — The AI oracle that calls it",
    description: "Pay-per-query AI oracle for prediction markets. 30s, $0.50, on-chain.",
    images: ["/gavel_logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
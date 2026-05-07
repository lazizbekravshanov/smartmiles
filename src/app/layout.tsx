// Root layout for the Next.js App Router. Required even when the app is mostly API-only.

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SmartMiles",
  description: "Free Telegram bot for owner-operators and small carriers — truck routing, fuel, weigh stations.",
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

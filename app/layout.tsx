import type { Metadata } from 'next';
import { Bungee_Outline, Inter } from 'next/font/google';
import { Analytics } from "@vercel/analytics/next"

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// The landing greeting only. Bungee Outline ships a single weight and no
// variable axes, so the weight has to be named.
const bungeeOutline = Bungee_Outline({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bungee-outline',
});

export const metadata: Metadata = {
  title: 'Anwar',
  description: 'Portfolio of Anwar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bungeeOutline.variable}`}>
      <body className="font-sans antialiased">{children}</body>
      <Analytics />
    </html>
  );
}

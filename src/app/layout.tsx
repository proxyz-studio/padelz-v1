import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Padel-Z · Phuket padel community',
  description:
    "Tournaments, leaderboard, and player profiles for Phuket's padel community. An installation by PROXYZ Studio.",
  metadataBase: new URL('https://padelz-v1.vercel.app'),
  openGraph: {
    title: 'Padel-Z',
    description: "Phuket's padel community platform. By PROXYZ Studio.",
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
        <Analytics />
        <SpeedInsights />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}

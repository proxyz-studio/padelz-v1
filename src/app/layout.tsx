import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { Ticker } from '@/components/Ticker';
import './globals.css';

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
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
    <html
      lang="en"
      className={`${plexMono.variable} ${plexSans.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <div className="mesh-bg" aria-hidden />
        <Ticker />
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
        <Analytics />
        <SpeedInsights />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}

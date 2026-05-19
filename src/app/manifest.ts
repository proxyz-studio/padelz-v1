import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Padel-Z',
    short_name: 'Padel-Z',
    description: 'Phuket padel community — tournaments, scores, leaderboard.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      // Next.js serves /icon (from src/app/icon.tsx, 512x512) — point both regular and maskable purposes at it.
      // Do NOT create /public/icons/*.png files; the next/og route is the single source of truth.
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    screenshots: [
      { src: '/screenshots/leaderboard-mobile.png', sizes: '1290x2796', type: 'image/png', form_factor: 'narrow', label: 'Leaderboard' },
      { src: '/screenshots/tournament-mobile.png', sizes: '1290x2796', type: 'image/png', form_factor: 'narrow', label: 'Tournament' },
      { src: '/screenshots/signin-mobile.png', sizes: '1290x2796', type: 'image/png', form_factor: 'narrow', label: 'Sign in' },
    ],
    shortcuts: [
      { name: 'Leaderboard', url: '/leaderboard' },
      { name: 'Tournaments', url: '/t' },
      { name: 'Sign in', url: '/sign-in' },
    ],
  };
}

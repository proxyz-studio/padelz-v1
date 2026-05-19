import Link from 'next/link';

export function Nav() {
  return (
    <header className="px-4 pt-4 pb-20">
      <div className="grid grid-cols-2 items-baseline gap-6 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <Link href="/" className="no-underline hover:no-underline">
          Padel-<span className="pink font-bold">Z</span>
        </Link>
        <Link href="/t" className="hidden md:block">
          Tournaments <span className="mute">↓</span>
        </Link>
        <Link href="/leaderboard" className="hidden md:block">
          Leaderboard <span className="mute">↓</span>
        </Link>
        <Link href="/about" className="hidden md:block mute">
          About
        </Link>
        <Link href="/sign-in" className="text-right">
          Login <span className="mute">→</span>
        </Link>
      </div>
    </header>
  );
}

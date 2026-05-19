import Link from 'next/link';

export const metadata = {
  title: 'Sign in · Padel-Z',
};

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-md px-6 pt-16 pb-24">
      <header className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
        <span>§ Authentication</span>
        <span>M1 · pending</span>
      </header>

      <h1 className="mt-16 text-4xl md:text-5xl font-light tracking-tight">
        Sign <span className="text-[var(--color-pink)]">in</span>
      </h1>

      <p className="mt-6 text-sm text-[var(--color-fg-muted)] leading-relaxed">
        Authentication wires through Clerk in milestone M1. This is the styled
        placeholder — the API is built, the keys arrive with the Phuket pilot kickoff.
      </p>

      <div className="mt-12 space-y-8">
        <div>
          <label
            htmlFor="email"
            className="block text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-3"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            disabled
            className="w-full bg-transparent border-b border-[var(--color-rule)] py-3 text-base placeholder:text-[var(--color-fg-faint)] focus:border-[var(--color-pink)] focus:outline-none transition-colors disabled:cursor-not-allowed"
          />
        </div>

        <button
          type="button"
          disabled
          className="w-full border border-[var(--color-fg-faint)] text-[var(--color-fg-faint)] px-5 py-3 text-xs uppercase tracking-[0.18em] cursor-not-allowed"
        >
          Continue → pending M1
        </button>

        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-faint)] text-center">
          Form disabled · live in M1
        </p>
      </div>

      <div className="mt-20 border-t border-[var(--color-rule)] pt-6 flex items-center justify-between text-[10px] uppercase tracking-[0.22em]">
        <Link
          href="/"
          className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
        >
          ← Homepage
        </Link>
        <Link
          href="/leaderboard"
          className="text-[var(--color-fg-muted)] hover:text-[var(--color-pink)] transition-colors"
        >
          Leaderboard →
        </Link>
      </div>
    </div>
  );
}

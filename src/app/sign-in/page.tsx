import Link from 'next/link';

export const metadata = {
  title: 'Sign in · Padel-Z',
};

export default function SignInPage() {
  return (
    <div className="px-4 pb-8">
      <p className="m-0 max-w-[640px]">
        Sign in to Padel-Z. Authentication wires through Clerk in
        milestone M1 — keys land with the Phuket pilot kickoff. The form
        below is the styled placeholder.
      </p>

      <div className="rule mt-20">
        <div className="grid grid-cols-[80px_1fr_280px_160px_56px] gap-6 mute pt-6 pb-3">
          <span>—</span>
          <span>Email</span>
          <span>Method</span>
          <span>Status</span>
          <span></span>
        </div>
      </div>

      <div className="grid grid-cols-[80px_1fr_280px_160px_56px] gap-6 items-baseline rule-bottom px-3 py-4">
        <span>2026</span>
        <span>
          <input
            type="email"
            placeholder="you@example.com"
            disabled
            className="score-input fn-blue text-left w-full"
            style={{ width: '100%', textAlign: 'left' }}
          />
        </span>
        <span className="mute">Magic link · Clerk</span>
        <span className="mute">
          Pending <span className="fn-blue font-bold">M1</span>
        </span>
        <span className="text-right mute">—</span>
      </div>

      <div className="mute mt-3 px-3 flex gap-8 flex-wrap">
        <Link href="/" className="mute">← Homepage</Link>
        <Link href="/leaderboard" className="mute">Leaderboard</Link>
        <span>Form disabled · live in M1</span>
      </div>
    </div>
  );
}

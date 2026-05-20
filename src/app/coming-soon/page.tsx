import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Opening soon · Padel-Z',
  description: "Phuket's padel community. Opening soon.",
};

export default function ComingSoonPage() {
  return (
    <div className="px-4 pb-8">
      <div style={{ paddingTop: '32vh' }}>
        <p>
          Padel-<span className="pink font-bold">Z</span>. Phuket&apos;s padel community.
        </p>
        <p className="mute">Opening soon.</p>
        <p className="mute" style={{ marginTop: '1em' }}>
          Got an invite link?{' '}
          <Link href="/sign-in">Sign in →</Link>
        </p>
      </div>
    </div>
  );
}

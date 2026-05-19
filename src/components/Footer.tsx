export function Footer() {
  return (
    <footer className="rule mt-20 px-4 pt-6 pb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="m-0 max-w-[640px]">©2026 — Padel-Z by PROXYZ Studio · Phuket</p>
          <p className="m-0 mt-1 mute max-w-[640px]">
            A tournament scoring system for padel clubs. Players submit
            scores, opponents confirm or dispute, the ledger updates the
            leaderboard.
          </p>
        </div>
        <div className="md:text-right">
          <p className="m-0">
            <a href="https://proxyz.studio" target="_blank" rel="noopener noreferrer">
              proxyz.studio <span className="mute">↗</span>
            </a>{' '}
            <span className="mute">·</span>{' '}
            <a href="https://github.com/proxyz-studio/padelz-v1" target="_blank" rel="noopener noreferrer">
              Source <span className="mute">↗</span>
            </a>
          </p>
          <p className="m-0 mt-1 mute">v0.5 · 2026</p>
        </div>
      </div>
    </footer>
  );
}

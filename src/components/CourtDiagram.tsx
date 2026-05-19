// Decorative padel court schematic — minimal line drawing.
// Used as a watermark layered behind hero content.
export function CourtDiagram({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
      aria-hidden="true"
      className={className}
    >
      {/* Outer court */}
      <rect x="2" y="2" width="396" height="196" />
      {/* Net */}
      <line x1="200" y1="2" x2="200" y2="198" strokeDasharray="2 2" />
      {/* Service lines */}
      <line x1="100" y1="40" x2="100" y2="160" />
      <line x1="300" y1="40" x2="300" y2="160" />
      <line x1="100" y1="100" x2="300" y2="100" />
      {/* Back walls (thick) */}
      <line x1="2" y1="2" x2="2" y2="198" strokeWidth="1" />
      <line x1="398" y1="2" x2="398" y2="198" strokeWidth="1" />
    </svg>
  );
}

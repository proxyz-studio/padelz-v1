import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 112,
          fontWeight: 900,
          letterSpacing: -8,
          color: '#1a1a1a',
        }}
      >
        P<span style={{ color: '#ff4193' }}>Z</span>
      </div>
    ),
    { ...size }
  );
}

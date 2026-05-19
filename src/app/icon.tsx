import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 320,
          fontWeight: 900,
          letterSpacing: -24,
          color: '#1a1a1a',
        }}
      >
        P<span style={{ color: '#ff4193' }}>Z</span>
      </div>
    ),
    { ...size }
  );
}

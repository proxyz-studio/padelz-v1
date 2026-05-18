module.exports = {
  ci: {
    collect: {
      url: [
        `${process.env.VERCEL_PREVIEW_URL || 'http://localhost:3000'}/`,
        `${process.env.VERCEL_PREVIEW_URL || 'http://localhost:3000'}/leaderboard`,
      ],
      numberOfRuns: 3,
      settings: { preset: 'mobile' },
    },
    assert: {
      assertions: {
        'first-contentful-paint': ['error', { maxNumericValue: 1500 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};

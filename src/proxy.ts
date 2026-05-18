import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { uuidv7 } from 'uuidv7';

const isProtected = createRouteMatcher(['/me(.*)', '/match(.*)', '/c/:slug/admin(.*)']);

export default clerkMiddleware((auth, req: NextRequest) => {
  if (isProtected(req)) auth.protect();

  const incoming = req.headers.get('x-request-id');
  const requestId = incoming && /^[a-z0-9-]{8,64}$/.test(incoming) ? incoming : uuidv7();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
});

export const config = { matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/(api|trpc)(.*)'] };

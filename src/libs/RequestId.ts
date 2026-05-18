import { uuidv7 } from 'uuidv7';
import { logger } from './Logger';

export function withRequestId(req: Request) {
  const incoming = req.headers.get('x-request-id');
  const requestId = incoming && /^[a-z0-9-]{8,64}$/.test(incoming) ? incoming : uuidv7();
  return { requestId, log: logger.child({ requestId }) };
}

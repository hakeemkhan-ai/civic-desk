import { getRuntime } from '../../../server/runtime';
import { responseHeaders } from '../../../server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  try {
    const response = await (await getRuntime()).handle(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return new Response(
      request.method === 'HEAD'
        ? null
        : JSON.stringify({ error: 'Civic Desk is temporarily unavailable. Please try again.' }),
      {
        status: 503,
        headers: responseHeaders({ 'Content-Type': 'application/json' }),
      },
    );
  }
}

export {
  handle as GET,
  handle as HEAD,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};

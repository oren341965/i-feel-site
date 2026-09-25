import profile from '../data/agent-profile.json';

// Public, static metadata; no customer information or submission endpoint.
export function GET() {
  return new Response(JSON.stringify(profile), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

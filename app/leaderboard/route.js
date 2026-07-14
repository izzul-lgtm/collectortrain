// app/api/leaderboard/route.js
// ─────────────────────────────────────────────────────────────────────────
// Pulls collection-rate leaderboard data from telcodashboard so every
// logged-in collector can see everyone's rate, ranked best-first.
//
// This is a SERVER-SIDE proxy: the browser calls THIS route (using the
// normal x-session-token auth, same as every other collectortrain API),
// and this route calls telcodashboard's /api/kpi-feed using a separate
// static API key — that key never reaches the browser.
//
// Required Vercel Project Settings -> Environment Variables (collectortrain):
//   TELCODASHBOARD_BASE_URL   e.g. https://telcodashboard.vercel.app
//   TELCODASHBOARD_API_KEY    MUST be the exact same value as
//                              KPI_FEED_API_KEY on the telcodashboard side.
import { requireAuth } from '../../../lib/requireAuth';

export async function GET(request) {
  // Any logged-in collector/manager/admin can view the leaderboard —
  // no role restriction, since the whole point is full transparency.
  const authError = await requireAuth(request);
  if (authError) return authError;

  const baseUrl = process.env.TELCODASHBOARD_BASE_URL;
  const apiKey  = process.env.TELCODASHBOARD_API_KEY;
  if (!baseUrl || !apiKey) {
    return Response.json({ error: 'TELCODASHBOARD_BASE_URL / TELCODASHBOARD_API_KEY not configured on server.' }, { status: 500 });
  }

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/kpi-feed`;
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data.error || 'Failed to load leaderboard from telcodashboard.' }, { status: res.status });
    }
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load leaderboard.' }, { status: 500 });
  }
}

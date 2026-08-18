// Vercel serverless proxy to the Smartsheet API.
// The browser cannot call api.smartsheet.com directly (no CORS), so the app
// calls /api/smartsheet?path=<encoded Smartsheet path> with the user's token in
// the `x-ss-token` header, and this function forwards it server-side.

export default async function handler(req, res) {
  const token = req.headers['x-ss-token']
  const path = req.query.path

  if (!token) return res.status(401).json({ error: 'Missing Smartsheet token' })
  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid path' })
  }
  // Only allow the read endpoints the app uses.
  const allowed = ['/sheets', '/serverinfo']
  if (!allowed.some(a => path === a || path.startsWith(a + '/') || path.startsWith(a + '?'))) {
    return res.status(400).json({ error: 'Path not allowed' })
  }

  try {
    const r = await fetch('https://api.smartsheet.com/2.0' + path, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    })
    const body = await r.text()
    res.status(r.status)
    res.setHeader('Content-Type', 'application/json')
    return res.send(body)
  } catch (e) {
    return res.status(502).json({ error: 'Proxy error: ' + String(e && e.message || e) })
  }
}

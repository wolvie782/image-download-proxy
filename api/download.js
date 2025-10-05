// GET /api/download?url=<encoded-remote-url>
export default async function handler(req, res) {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send('Missing url');

    const upstream = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': `https://${new URL(url).hostname}/`
      }
    });
    if (!upstream.ok) return res.status(502).send(`Upstream ${upstream.status}`);

    const ab = await upstream.arrayBuffer();
    const buf = Buffer.from(ab);
    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    const filename = (new URL(url).pathname.split('/').pop() || 'download')
      .replace(/[^\w.\-]+/g, '_');

    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).send('Proxy error: ' + (e?.message || e));
  }
}

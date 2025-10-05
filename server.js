import express from "express";

const app = express();

// If you plan to XHR this endpoint, allow CORS (safe if you limit hosts below).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Optional: simple allowlist to avoid SSRF/misuse
const ALLOWED = new Set([
  "nicepng.com",
  "www.nicepng.com",
  // add more hosts you trust:
  // "example.com"
]);

// GET /download?url=<encoded-remote-image>
app.get("/download", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send("Missing url");

    let host;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return res.status(400).send("Invalid url");
    }
    if (ALLOWED.size && !ALLOWED.has(host)) {
      return res.status(403).send("Domain not allowed");
    }

    // Fetch the remote file (follow redirects). Node 18+ has global fetch.
    const upstream = await fetch(url, {
      redirect: "follow",
      headers: {
        // Helps with hotlink protections on many sites
        "Referer": `https://${host}/`,
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(502).send(`Upstream ${upstream.status}`);
    }

    // Figure out filename + content-type
    const pathname = new URL(url).pathname;
    const filenameRaw = pathname.split("/").pop() || "download";
    const filename = filenameRaw.replace(/[^\w.\-]+/g, "_");
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";

    // Set headers to force download
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");

    // Stream the response body to client (no buffering)
    // Node 18 fetch returns a Web ReadableStream; convert it to Node stream:
    if (upstream.body.getReader) {
      // Web stream → Node stream
      const { Readable } = await import("node:stream");
      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.pipe(res);
    } else {
      // Fallback: buffer (older environments)
      const arrayBuffer = await upstream.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    }
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Proxy error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Image download proxy running on http://localhost:${PORT}`);
});

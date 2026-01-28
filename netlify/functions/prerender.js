const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

// Netlify function to render a simple HTML page with Open Graph meta for a post.
// Behavior:
// - If UPSTREAM_API is set, try to fetch `${UPSTREAM_API}/posts/:id` expect JSON { id, title, details, photo }
// - Else if data/posts.json exists, try to read metadata from it
// - Otherwise return a minimal fallback page with generic OG tags and the path URL

const fs = require('fs');
const path = require('path');

exports.handler = async function(event) {
  try {
    const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    const origin = (event.headers && (event.headers['x-forwarded-proto'] || event.headers['x-forwarded-protocol'])) || 'https';
    const host = (event.headers && (event.headers.host || event.headers.Host)) || '';
    const url = `${origin}://${host}/p/${encodeURIComponent(id)}`;

    // default metadata
    let meta = { title: 'Neighbloom post', description: 'View this neighborhood post on Neighbloom.', image: '/assets/og-fallback.png', url };

    if (process.env.UPSTREAM_API && id) {
      try {
        const res = await fetch(`${process.env.UPSTREAM_API.replace(/\/$/, '')}/posts/${encodeURIComponent(id)}`);
        if (res.ok) {
          const j = await res.json();
          meta.title = j.title || meta.title;
          meta.description = j.details || meta.description;
          if (j.photo) meta.image = j.photo;
          meta.url = j.url || meta.url;
        }
      } catch (e) {
        // ignore and fall back
      }
    } else {
      // try local data file at repository root: data/posts.json
      try {
        const dataPath = path.join(__dirname, '..', '..', 'data', 'posts.json');
        if (fs.existsSync(dataPath)) {
          const raw = fs.readFileSync(dataPath, 'utf8');
          const parsed = JSON.parse(raw || '{}');
          if (parsed && parsed[id]) {
            const j = parsed[id];
            meta.title = j.title || meta.title;
            meta.description = j.details || meta.description;
            if (j.photo) meta.image = j.photo;
            meta.url = j.url || meta.url;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(meta.title)}</title>
    <meta property="og:site_name" content="Neighbloom" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:image" content="${escapeHtml(meta.image)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(meta.url)}" />
    <link rel="canonical" href="${escapeHtml(meta.url)}" />
  </head>
  <body>
    <main style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:40px;">
      <h1 style="font-size:20px">${escapeHtml(meta.title)}</h1>
      <p style="color:#555">${escapeHtml(meta.description)}</p>
      <p><a href="${escapeHtml(url)}">Open in Neighbloom</a></p>
    </main>
  </body>
</html>`;

    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: html };
  } catch (err) {
    return { statusCode: 500, body: 'Server error' };
  }
};

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>\"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}

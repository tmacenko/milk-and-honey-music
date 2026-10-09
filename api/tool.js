// api/tool.js — owner-only static tools, served from tools/ (never public/,
// which anyone with the link could load). /release-stories/* rewrites here;
// every file — page, script, fonts, logos — checks the session first.
const fs = require('fs');
const path = require('path');
const { authState } = require('../lib/auth');

const OWNERS = String(process.env.USAGE_OWNERS || 'tyler@milkhoneyla.com').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
const TOOLS = { 'release-stories': path.join(process.cwd(), 'tools', 'release-stories') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.otf': 'font/otf', '.svg': 'image/svg+xml', '.json': 'application/json' };

module.exports = (req, res) => {
  const st = authState(req);
  const email = String((st.user && st.user.email) || '').toLowerCase();
  if (!st.user || !OWNERS.includes(email)) {
    res.statusCode = 404; // don't advertise that anything is here
    return res.end('Not found');
  }
  const root = TOOLS[String((req.query || {}).tool || '')];
  if (!root) { res.statusCode = 404; return res.end('Not found'); }
  const rel = String((req.query || {}).path || 'index.html').replace(/^\/+/, '') || 'index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep)) { res.statusCode = 400; return res.end('Bad path'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end(buf);
  });
};

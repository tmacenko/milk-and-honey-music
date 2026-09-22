#!/usr/bin/env node
// Weekly Bandsintown harvest — runs on Tyler's Mac (launchd, Friday mornings),
// NOT on the server: Bandsintown's bot wall only admits real browsers, so we
// drive headless Chrome locally, read each artist page's schema.org JSON-LD,
// and post the results to the site (action 'artist-shows-store', authed by
// HARVEST_SECRET in ~/.mh-harvest-secret — never committed to the repo).
// The dashboard's Upcoming shows module prefers these entries for 8 days and
// falls back to live Ticketmaster lookups when they go stale.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';

const SITE = 'https://www.milkandhoneyfamily.com';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const secret = fs.readFileSync(os.homedir() + '/.mh-harvest-secret', 'utf8').trim();

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Artist list from the public roster payload (Artist-type clients).
const data = await (await fetch(`${SITE}/api/sheets`)).json();
const artists = (data.clients || []).filter(c => c.name && (c.types || []).includes('Artist')).map(c => c.name);
console.log(new Date().toISOString(), '— harvesting', artists.length, 'artists');

// Chrome dumps the rendered DOM, then lingers on ad-network connections —
// kill it as soon as stdout closes (the dump is complete by then).
function chromeDump(url, budget = 15000) {
  return new Promise((resolve) => {
    const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--virtual-time-budget=${budget}`,
      '--dump-dom', `--user-data-dir=${os.tmpdir()}/mh-harvest-profile`, `--user-agent=${UA}`, url]);
    let out = '', done = false;
    const finish = () => { if (!done) { done = true; try { p.kill('SIGKILL'); } catch { /* already gone */ } resolve(out); } };
    p.stdout.on('data', d => { out += d; });
    p.stdout.on('end', finish);
    p.on('error', finish);
    setTimeout(finish, 60000).unref?.();
  });
}

function parseArtistPage(html) {
  const events = []; let artist = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let d; try { d = JSON.parse(m[1]); } catch { continue; }
    for (const x of Array.isArray(d) ? d : [d]) {
      if (x['@type'] === 'MusicGroup') artist = x.name || null;
      if (x['@type'] !== 'MusicEvent') continue;
      // City isn't in the JSON-LD address block; the description reads
      // "Venue, City" — take the tail as a best-effort city label.
      const desc = String(x.description || '');
      events.push({
        date: x.startDate || '',
        venue: (x.location || {}).name || '',
        city: desc.includes(',') ? desc.slice(desc.lastIndexOf(',') + 1).trim() : '',
        url: (x.offers || {}).url || x.url || '',
      });
    }
  }
  return { artist, events };
}

const shows = {}; const skipped = [];
const harvestOne = async (name, budget) => {
  const slug = name.replace(/[^A-Za-z0-9]/g, '');
  if (!slug) return 'skip';
  const html = await chromeDump(`https://www.bandsintown.com/${slug}`, budget);
  const { artist, events } = parseArtistPage(html);
  if (!artist) return 'nopage'; // page didn't finish rendering (or doesn't exist) — retry pass decides
  if (norm(artist) !== norm(name)) { skipped.push(`${name} (landed on "${artist}")`); return 'skip'; } // never store another act's tour
  shows[name] = events; // empty array is a valid answer: no upcoming shows
  console.log(`  ${name}: ${events.length} shows`);
  return 'ok';
};
const retry = [];
for (const name of artists) {
  if (await harvestOne(name, 15000) === 'nopage') retry.push(name);
  await new Promise(r => setTimeout(r, 3000)); // polite pacing
}
// Second pass with a longer render budget — heavy pages sometimes miss the
// first window; a miss here means the artist genuinely has no page.
for (const name of retry) {
  if (await harvestOne(name, 40000) === 'nopage') skipped.push(`${name} (no artist page)`);
  await new Promise(r => setTimeout(r, 3000));
}

const resp = await (await fetch(`${SITE}/api/sheets`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'artist-shows-store', secret, shows }),
})).json();
console.log('stored:', JSON.stringify(resp));
if (skipped.length) console.log('skipped:', skipped.join('; '));

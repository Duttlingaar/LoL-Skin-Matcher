/**
 * generate-palettes.js
 *
 * Fetches all LoL skins, extracts dominant color palettes from their
 * loading-screen images, and writes the result to skin-palettes.json.
 *
 * Only skins that are missing or whose URL changed are re-analyzed,
 * so incremental runs (e.g. after a patch) are fast.
 *
 * Usage:  node generate-palettes.js
 */

import fetch from 'node-fetch';
import { createCanvas, loadImage } from 'canvas';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ── Config ────────────────────────────────────────────────────────────────────
const VER               = '16.6.1';   // bump when you want to force a version
const DD                = `https://ddragon.leagueoflegends.com/cdn`;
const CHAMPION_FULL_URL = `${DD}/${VER}/data/en_US/championFull.json`;
const OUTPUT_FILE       = 'skin-palettes.json';
const PALETTE_SIZE      = 12;   // k-means clusters per skin
const CANVAS_SIZE       = 64;   // image is scaled to this before analysis
const BATCH_SIZE        = 20;   // concurrent image fetches
const DEDUP_THRESH      = 24;   // min RGB distance between kept palette colors

// ── Helpers ───────────────────────────────────────────────────────────────────
function dist2(a, b) {
  return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
}

function dedup(colors, thresh = DEDUP_THRESH) {
  const out = [];
  for (const c of colors) {
    if (!out.some(x => Math.sqrt(dist2(c, x)) < thresh)) out.push(c);
  }
  return out;
}

/**
 * k-means++ color clustering on raw RGBA pixel data.
 * Returns up to k colors sorted by cluster weight (most dominant first).
 */
function kMeans(data, k) {
  const px = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 20) continue;
    px.push([data[i], data[i+1], data[i+2]]);
  }
  if (!px.length) return [];

  // k-means++ seeding
  let C = [px[Math.floor(Math.random() * px.length)]];
  while (C.length < k) {
    const ds = px.map(p => Math.min(...C.map(c => dist2(p, c))));
    const sum = ds.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < px.length; i++) {
      r -= ds[i];
      if (r <= 0) { C.push(px[i]); break; }
    }
  }

  // iterate
  for (let it = 0; it < 12; it++) {
    const cl = Array.from({ length: k }, () => []);
    for (const p of px) {
      let best = 0, bd = 1e9;
      C.forEach((c, j) => { const v = dist2(p, c); if (v < bd) { bd = v; best = j; } });
      cl[best].push(p);
    }
    let changed = false;
    C = C.map((c, j) => {
      if (!cl[j].length) return c;
      const n = [0, 1, 2].map(i => Math.round(cl[j].reduce((s, p) => s + p[i], 0) / cl[j].length));
      if (n.some((v, i) => v !== c[i])) changed = true;
      return n;
    });
    if (!changed) break;
  }

  // weight clusters by pixel count
  const weights = new Array(k).fill(0);
  for (const p of px) {
    let best = 0, bd = 1e9;
    C.forEach((c, j) => { const v = dist2(p, c); if (v < bd) { bd = v; best = j; } });
    weights[best]++;
  }

  return C
    .map((c, i) => ({ color: c, w: weights[i] }))
    .sort((a, b) => b.w - a.w)
    .map(({ color }) => color);
}

/**
 * Download an image, draw it on a 64×64 canvas, run k-means,
 * dedup and return palette as array of [r,g,b] triples.
 */
async function extractPalette(url) {
  const cvs = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = cvs.getContext('2d');
  const img = await loadImage(url);
  ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const raw = kMeans(data, PALETTE_SIZE);
  return dedup(raw);
}

function isRenderableSkin(skin) {
  return !Object.prototype.hasOwnProperty.call(skin, 'parentSkin');
}

function loadingUrl(championId, skinNum) {
  return `${DD}/img/champion/loading/${championId}_${skinNum}.jpg`;
}

function splashUrl(championId, skinNum) {
  return `${DD}/img/champion/splash/${championId}_${skinNum}.jpg`;
}

async function processBatch(skins, existing) {
  const results = await Promise.allSettled(
    skins.map(async s => {
      try {
        const palette = await extractPalette(s.analysisUrl);
        return { ...s, palette };
      } catch {
        return { ...s, palette: existing[s.analysisUrl] ?? [] };
      }
    })
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Load existing output so we can skip skins that haven't changed
  const existingMap = {}; // analysisUrl → palette
  if (existsSync(OUTPUT_FILE)) {
    try {
      const old = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
      for (const entry of old) {
        if (entry.analysisUrl && entry.palette?.length) {
          existingMap[entry.analysisUrl] = entry.palette;
        }
      }
      console.log(`Loaded ${Object.keys(existingMap).length} cached palettes from ${OUTPUT_FILE}`);
    } catch {
      console.warn('Could not parse existing skin-palettes.json, starting fresh.');
    }
  }

  // 2. Fetch champion data to build full skin list
  console.log(`Fetching champion data from DataDragon (${VER})...`);
  const res = await fetch(CHAMPION_FULL_URL);
  if (!res.ok) throw new Error(`DataDragon HTTP ${res.status}`);
  const { data } = await res.json();

  const allSkins = Object.values(data).flatMap(champion =>
    champion.skins
      .filter(isRenderableSkin)
      .map(skin => ({
        skinName:    skin.num === 0 ? `${champion.name} (Default)` : skin.name,
        url:         splashUrl(champion.id, skin.num),
        analysisUrl: loadingUrl(champion.id, skin.num),
      }))
  );
  console.log(`Found ${allSkins.length} skins total`);

  // 3. Split into cached vs. needs analysis
  const cached  = allSkins.filter(s => existingMap[s.analysisUrl]?.length);
  const pending = allSkins.filter(s => !existingMap[s.analysisUrl]?.length);
  console.log(`${cached.length} cached, ${pending.length} need analysis`);

  // 4. Carry over cached entries
  const output = cached.map(s => ({ ...s, palette: existingMap[s.analysisUrl] }));

  // 5. Analyze pending skins in batches
  if (pending.length) {
    console.log(`Analyzing ${pending.length} skins in batches of ${BATCH_SIZE}...`);
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const done  = await processBatch(batch, existingMap);
      output.push(...done);
      const pct = Math.min(i + BATCH_SIZE, pending.length);
      process.stdout.write(`\r  ${pct}/${pending.length}`);
    }
    console.log('\nDone.');
  }

  // 6. Sort to keep file order stable (champion name → skin num implied by order)
  output.sort((a, b) => a.skinName.localeCompare(b.skinName));

  // 7. Write output
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.length} entries to ${OUTPUT_FILE}`);
}

main().catch(err => { console.error(err); process.exit(1); });

# LoL Skin Matcher

LoL Skin Matcher helps League of Legends players find champion skins that match their profile icon, border, and crystal based on color similarity.

## Features

- Browse and search all Riot profile icons
- Optionally add a ranked border and crystal to refine the color palette
- Instant skin matching powered by pre-computed color palettes — no image analysis in the browser
- Falls back to live image analysis for any skins not yet in the palette database
- Browser IndexedDB caching for repeat visits

## How It Works

1. Select a profile icon → dominant colors are extracted client-side using k-means clustering
2. Optionally select a border and crystal → their colors are merged into a combined palette
3. Click **Find Matching Skins** → the combined palette is compared against pre-computed skin palettes using weighted color similarity
4. Results are ranked by match score and displayed with a percentage indicator

## Architecture

The project consists of three parts:

### `index.html`
The entire frontend — a single HTML file with embedded CSS and JavaScript. No framework, no build step required.

### `skin-palettes.json`
A pre-computed database of dominant color palettes for all ~2000+ League skins, generated from loading-screen artwork. This file is bundled with the site and eliminates the need for the browser to download and analyze skin images at runtime.

### `generate-palettes.js`
A Node.js script that downloads all skin loading-screen images, runs k-means color clustering on each, and writes the results to `skin-palettes.json`. Run once manually or automatically via CI.

```bash
npm install
node generate-palettes.js
```

## Automatic Updates

A GitHub Actions workflow (`.github/workflows/update-palettes.yml`) runs every Monday at 03:00 UTC. It:

1. Fetches the latest champion data from DataDragon
2. Detects any skins missing from the current `skin-palettes.json`
3. Analyzes only the new skins (incremental — existing entries are reused)
4. Commits and pushes the updated file if changes were found

Manual runs are also possible via the **Actions** tab → **Update Skin Palettes** → **Run workflow**.

## Data Sources

- [Riot Data Dragon](https://developer.riotgames.com/docs/lol)
- [CommunityDragon](https://www.communitydragon.org)

## Notes

- Results depend on currently available Riot/CDN assets.
- This project is not endorsed by Riot Games. All League of Legends assets are property of Riot Games, Inc.

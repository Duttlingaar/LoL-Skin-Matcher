# LoL Skin Matcher

LoL Skin Matcher is a lightweight single-page tool that helps League of Legends players match profile icons, borders, and crystals with champion skins based on color similarity.

## Features

- Browse and search Riot profile icons
- Add optional borders and crystals to refine the palette
- Generate matching skin suggestions based on extracted image colors
- Cache computed palettes in the browser to reduce repeated analysis work
- Run entirely in the browser without a build step

## How It Works

The app loads icon metadata and champion skin data, extracts dominant colors from the selected assets, combines those colors into a shared palette, and compares that palette against League skin artwork to find visually compatible results.

## Data Sources

- Riot Data Dragon
- CommunityDragon

## Notes

- This project is a static HTML application.
- Results depend on the currently available Riot/CDN assets.
- Browser caching and IndexedDB are used to reduce repeat network and analysis costs.

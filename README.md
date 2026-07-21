# Mosaic — Creative Reference Lab

Mosaic is a website-first analytical reference assistant for graphic and visual designers. Write a creative brief, attach a local reference folder, and optionally enable Automatic Search to build one ranked, explainable posterboard from local and open-license references.

## Included workflow

- Manual folder input with local-only browser analysis
- Automatic Search toggle using a provider-backed discovery route
- Unified local/online ranking with source and license labels
- Per-reference composition, angle, framing, lighting, color, and technical analysis
- Creative Direction signals, Style DNA, palette directions, diversity checks, and accessibility reminders
- Pin, remove, filter, expand, and rerun interactions
- Browser export of `creative-reference-manifest.json` and `posterboard.html`

The current discovery route is a safe demo adapter backed by Wikimedia Commons examples. Replace `app/api/discover/route.ts` with approved provider adapters for production X, Meta, Instagram, Facebook, Pinterest, or other sources. Local files and previews are not sent to the discovery route.

## Run locally

```bash
npm install
npm run dev
npm run build
npm run lint
```

Automatic Search is off by default. Turn it on before Analyze to fetch the demo online references. Online assets remain source-linked and attributed rather than being silently copied into the export.

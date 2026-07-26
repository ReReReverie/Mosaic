# Creative Reference Assistant

An analytical AI partner for graphic and visual designers. Enter a creative brief, select a reference folder, and get a ranked moodboard with explainable reasons, Style DNA, diversity suggestions, palette recommendations, and accessibility warnings.

## Local Setup

### Prerequisites

- Node.js 18+
- npm 9+
- (Optional) GraphicsMagick or ImageMagick for PDF thumbnail generation

```bash
# Clone and install
cd creative-reference-assistant
npm ci

# Copy env template
cp .env.example .env.local
# Add your OpenAI API key if you want AI-enhanced prompt parsing (optional)
# OPENAI_API_KEY=sk-...
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Tests

```bash
npm test
```

### Build

```bash
npm run build
npm start
```

The production build requires a Node.js host because image and PDF analysis use
server-side libraries. Uploaded files are validated server-side, limited to
50 MB per file and 250 MB per analysis, and are kept in the active browser
session rather than persisted to local storage.

## Usage

1. Enter a creative brief (e.g. *"Find references for a warm, editorial poster about local food for young adults."*)
2. Upload a folder of reference images, PDFs, and documents
3. Adjust creative constraints (format, output type, scoring weights) as needed
4. Review the ranked posterboard
5. Pin, remove, or mark references as too similar
6. Export the package as a ZIP

## Features

- **Creative Direction Breakdown** — structured intent extracted from your brief
- **Explainable Ranking** — every reference card shows evidence-based reasons
- **Style DNA** — shared visual characteristics of your selected references
- **Diversity Suggestions** — detects repetitive boards and recommends alternatives
- **Palette Recommendations** — three palette options derived from your references
- **Accessibility Checker** — WCAG 2.1 AA contrast and color-blind risk warnings
- **ZIP Export** — portable package with references, palettes, and a standalone posterboard.html

## AI Enhancement

When `OPENAI_API_KEY` is set, GPT-4o improves prompt parsing and explanation quality. The app is fully functional without an API key using deterministic fallbacks.

## Notes on PDF Thumbnails

PDF thumbnail generation requires either GraphicsMagick or ImageMagick to be installed on the system. If neither is available, PDFs are still analyzed for text content but no thumbnail is generated.

## Architecture

```
core/           — Platform-neutral analysis engine (no Next.js imports)
  analyzers/    — Per-format feature extractors
app/api/        — Next.js API routes (thin adapters over core)
components/     — React UI components
lib/            — Client-side utilities and Zustand store
demo-assets/    — Sample reference files for testing
```

# Creative Reference Assistant

An analytical AI partner for graphic and visual designers. Enter a creative brief, select a reference folder, and get a ranked moodboard with explainable reasons, Style DNA, diversity suggestions, palette recommendations, and accessibility warnings.

## Installation

This section is written for a teammate or hackathon judge starting on a fresh
device. The default setup does not require an OpenAI API key or a Neon account;
the app uses deterministic analysis and browser-local state when those services
are not configured.

### Prerequisites

- Node.js 20.9 or newer: [nodejs.org/download](https://nodejs.org/download)
- npm 10 or newer (installed with Node.js)
- A modern Chromium-based browser such as Chrome or Edge
- Optional: GraphicsMagick or ImageMagick for PDF thumbnails

Check the installed versions before continuing:

```bash
node --version
npm --version
```

### 1. Clone the repository

```bash
git clone https://github.com/RodelioC03/creative-reference-assistant.git
cd creative-reference-assistant
```

### 2. Install dependencies

Run this from the project directory:

```bash
npm ci
```

### 3. Create the local environment file

On macOS or Linux:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Leave the copied file unchanged for the fastest demo. Add a server-side
`GEMINI_API_KEY` only if you want AI-assisted brief interpretation. Never
commit `.env.local`, expose secrets through `NEXT_PUBLIC_` variables, or put a
personal API key in a deployment environment.

### 4. Start the website

```bash
npm run dev
```

Open [http://localhost:9000](http://localhost:9000) in your browser. Enter a
brief, choose a folder of reference files, and run the analysis. Supported
inputs include common image files, PDFs, SVGs, text files, and documents.

### Quick-start command list

For a judge who only needs to run the demo:

```bash
git clone https://github.com/RodelioC03/creative-reference-assistant.git
cd creative-reference-assistant
npm ci
npm run dev
```

Then open [http://localhost:9000](http://localhost:9000).

### API configuration

No API configuration is needed to test the website locally. The deterministic
analysis path is enabled when no hosted key is configured:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=
DATABASE_URL=
```

For the hosted Vercel deployment, set `GEMINI_API_KEY` in Vercel's server-only
environment variables. Gemini is the default provider. `OPENAI_API_KEY` is
retained as a backwards-compatible fallback for existing deployments.

The Mosaic UI also supports a session-only personal key for Google Gemini,
OpenAI, or Anthropic. That key is sent over HTTPS in a request header, kept in
browser memory only, and never written to Neon, localStorage, Vercel, URLs, or
application responses. Clearing the key or starting a new session removes it.

### Neon persistence (deferred)

Neon is not required for this installation. When backend configuration is
ready, it can store analysis-session metadata so a saved board can be restored
after a browser refresh. Uploaded source files remain ephemeral.

For later setup:

1. Create a PostgreSQL database at [neon.tech](https://neon.tech).
2. Run [`db/schema.sql`](db/schema.sql) in the Neon SQL Editor.
3. Add the connection string to `.env.local` as `DATABASE_URL`.
4. Restart the development server.

If `DATABASE_URL` is omitted, the app still runs using browser-local state.

### Hosted Vercel demo

The shared Vercel demo can use a project-provided free-tier API configuration
for hackathon testing. Because that configuration is shared, response speed
and usage limits may vary. Set `GEMINI_API_KEY` as a server-only Vercel
environment variable to enable the default Gemini provider. Users can also
enter their own supported provider key from the AI Provider panel; that
session override is never persisted by the application. The local
installation does not require any API key.

### Vercel deployment (deferred)

Vercel is not required to install or test the app on a device. When deployment
is ready, import the repository as a standard Next.js project and keep these
defaults:

- Framework preset: Next.js
- Build command: `npm run build`
- Output directory: leave the Vercel default
- Node.js version: 20.x or newer

Leave Vercel environment variables empty until backend configuration is ready.
The analysis route uses the Node.js runtime for image and PDF processing.

For a hackathon demo, use a small reference folder. Uploaded files are sent to
the analysis endpoint for the active session and are not durable file storage;
cross-device file persistence would require object storage such as Vercel Blob,
S3, or R2.

### Verification commands

Run these before submitting or deploying:

```bash
npm run lint
npm test
npm run build
```

To run the production build locally:

```bash
npm run build
npm start
```

Then open [http://localhost:9000](http://localhost:9000).

### Troubleshooting

- **`npm ci` fails:** confirm `node --version` is at least `20.9.0`, then run
  the command again from the repository root.
- **Port 9000 is already in use:** stop the other process, or run
  `npm run dev -- -p 9001` and open `http://localhost:9001`.
- **No AI key:** this is expected; deterministic prompt interpretation is the
  default behavior.
- **PDFs have no thumbnail:** install GraphicsMagick or ImageMagick. PDF text
  analysis still works without either dependency.
- **Neon session not found:** verify `DATABASE_URL`, run `db/schema.sql`, and
  restart the server. Existing uploads still need to be selected again because
  source files are intentionally not persisted.

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

When `GEMINI_API_KEY` is set, Gemini improves prompt parsing and explanation
quality. OpenAI and Anthropic are also supported for session-only personal
overrides. The app remains fully functional without a key using deterministic
fallbacks.

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

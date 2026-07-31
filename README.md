# Mosaic — Creative Reference Lab

Mosaic is an analytical AI partner for graphic and visual designers. Enter a creative brief, select a reference folder, and get a ranked moodboard with explainable reasons, Style DNA, diversity suggestions, palette recommendations, and accessibility warnings.

Repository: [ReReReverie/Mosaic.git](https://github.com/ReReReverie/Mosaic.git)

Hosted website: [Mosaic](https://mosaic-alpha-taupe.vercel.app/)

## Project leadership

- **Lead developer / team leader:** Lanz Martene
- **Project manager:** RodelioC03
- **Demo lead:** Miguel De Guzman

## Installation

This section is written for a teammate or hackathon judge starting on a fresh
device. The default setup does not require an API key or any hosted service; the app
uses deterministic analysis and browser-local state when hosted services are not
configured.

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
git clone https://github.com/ReReReverie/Mosaic.git
cd Mosaic
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

Leave the copied file unchanged for the fastest deterministic demo. Add a
provider key only if you want AI-assisted brief interpretation and reference
enrichment. Never commit `.env.local`, expose secrets through `NEXT_PUBLIC_`
variables, or put a personal API key in source control.

### 4. Start the website in Docker

```bash
docker compose up --build
```

Open [http://localhost:9000](http://localhost:9000) in your browser. Enter a
brief, choose a folder of reference files, and run the analysis. Supported
inputs include common image files, PDFs, SVGs, text files, and documents. A
reference folder is limited to 50 files per analysis. The container includes
the native image and PDF tooling required by the scanner.

### Quick-start command list

For a judge who only needs to run the demo:

```bash
git clone https://github.com/ReReReverie/Mosaic.git
cd Mosaic
npm ci
docker compose up --build
```

Then open [http://localhost:9000](http://localhost:9000).

### API configuration

No API configuration is required to run the website locally, and the
deterministic analysis path remains available without one. However, results
will be limited and may become stale without AI enrichment. Mosaic's core idea
is Analytical AI, so we strongly advise using your own personal provider API
key for the most complete and current results. Optional provider keys are
loaded from `.env.local` by Docker:

```dotenv
# Preferred hosted provider.
GROQ_API_KEY=
GROQ_MODEL=qwen/qwen3.6-27b
# Optional server-side providers
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-haiku-latest
REPLICATE_API_TOKEN=
REPLICATE_MODEL=sai88uk/minicpm-v-45-v9:5f9e86550c3540aab9292e0cae22f71bb75724be3c9bb72ebf0798d028f0f27b
MOSAIC_VISION_ENABLED=true
MOSAIC_VISION_MAX_FILES=50
# Maximum concurrent AI reference enrichments (1-4). Default: 4.
MOSAIC_AI_MAX_CONCURRENCY=4
```

#### Recommended API: Groq

For the fullest AI-assisted experience, we recommend using the [Groq API](https://console.groq.com/).
Create a personal API key, add it to `.env.local` as `GROQ_API_KEY`, and keep
`GROQ_MODEL=qwen/qwen3.6-27b` for Mosaic's configured default.

Groq is the preferred default when `GROQ_API_KEY` is configured. The current
environment configuration only includes the active Groq, OpenAI, Anthropic,
and Replicate provider variables.

### Personal API keys (session-only)

The Mosaic UI lets a user temporarily override the configured provider with
their own key. The currently exposed providers are Groq, OpenAI, Anthropic
Claude, and Replicate.

To use a personal key:

1. Open **Use your own engine** in the left sidebar.
2. Select Groq, OpenAI, Anthropic, or Replicate.
3. Paste the provider key and run an analysis.
4. Clear the key or start a new session when finished.

The key is kept in React memory only and sent to `/api/analyze` through a
request header for the active request. It is not stored in localStorage,
sessionStorage, URLs, application responses, or the Docker-mounted source tree.
Refreshing the page or clearing the key removes it from the browser.

### Local persistence

Analysis metadata is persisted in the browser's local storage so the saved
board can be reopened locally without a database. Uploaded source files remain
ephemeral and are not written to the repository or Docker volumes.

For a local-only demo, use a reference folder with no more than 50 files.
Uploaded files are sent to the local analysis container for the active session
and are not durable file storage.

### Verification commands

Run these before submitting or running the Docker image:

```bash
npm run lint
npm test
npm run build
```

### Docker development

To keep Node.js packages, native image/PDF tools, the Next.js server, and build
artifacts out of the host environment, use Docker Desktop for development:

```bash
docker compose up --build
```

Open [http://localhost:9000](http://localhost:9000) after the container starts.
If port 9000 is already in use, set `MOSAIC_HOST_PORT` to another local port.

PowerShell example:

```powershell
$env:MOSAIC_HOST_PORT = "9001"
docker compose up --build
```

The equivalent Bash command is `MOSAIC_HOST_PORT=9001 docker compose up --build`.
The repository is mounted only for source-code edits; `node_modules` and `.next`
are stored in Docker-managed volumes. Install or update packages inside the
container with:

```bash
docker compose run --rm app npm install <package-name>
```

Run checks in the same isolated environment with:

```bash
docker compose run --rm app npm test
docker compose run --rm app npm run lint
docker compose run --rm app npm run build
```

Copy `.env.example` to `.env.local` for local provider configuration. It is
ignored by Git and loaded only into the container.
Docker Desktop still uses host disk and memory for its managed images and
volumes, but application packages and native tools are not installed globally
on Windows.

### Troubleshooting

- **`npm ci` fails:** confirm `node --version` is at least `20.9.0`, then run
  the command again from the repository root.
- **Port 9000 is already in use:** stop the other process, or run
  `npm run dev -- -p 9001` and open `http://localhost:9001`.
- **No hosted AI key:** this is expected; deterministic prompt interpretation is
  the default behavior. A user can add a personal key from **Use your own
  engine** for the current session.
- **PDFs have no thumbnail:** install GraphicsMagick or ImageMagick. PDF text
  analysis still works without either dependency.
- **No saved board after clearing browser storage:** local board metadata is
  stored in the browser. Existing uploads still need to be selected again
  because source files are intentionally not persisted.

## Usage

1. Enter a creative brief (e.g. *"Find references for a warm, editorial poster about local food for young adults."*)
2. Upload a folder of reference images, PDFs, and documents
3. Review the ranked posterboard
4. Pin, remove, or mark references as too similar

## Features

- **Explainable Ranking** — every reference card shows evidence-based reasons
- **Style DNA** — shared visual characteristics of your selected references
- **Diversity Suggestions** — detects repetitive boards and recommends alternatives
- **Palette Recommendations** — three palette options derived from your references
- **Accessibility Checker** — WCAG 2.1 AA contrast and color-blind risk warnings

## AI Enhancement

When `GROQ_API_KEY` is set, Groq is the preferred provider for prompt parsing,
explanation quality, and reference enrichment. OpenAI, Anthropic, and Replicate
are also supported as session-only personal overrides from the UI.
When a provider is configured, AI also analyzes up to
`MOSAIC_VISION_MAX_FILES` references (50 by default, enough for the normal
board size): OpenAI/Groq/Replicate vision-capable models
receive the image, while text-only models receive the measured visual evidence
and metadata. Set `MOSAIC_VISION_ENABLED=false` to keep analysis local. Provider
failures always fall back to deterministic pixel and metadata analysis. Match
cards label whether their evidence is semantic, metadata-based, visual, or
curated demo discovery.

AI reference enrichment runs up to four independent provider requests at once
by default and refills a slot as soon as an image completes. Set
`MOSAIC_AI_MAX_CONCURRENCY` to a value from 1 to 4 to tune throughput. If the
provider exhausts its rate-limit retries, the scheduler backs off for the
remaining images and those images keep their deterministic fallback analysis.

### API used for this project

The AI-assisted image analysis used while building and testing this project
ran through the [Replicate API](https://replicate.com/) with the pinned
MiniCPM-V model:

`sai88uk/minicpm-v-45-v9`

We were only able to obtain limited credits for development, so response
availability and the number of AI-enriched references may be limited. The
project still includes a deterministic local analysis path when no provider is
available.

### Free image-capable API options

“Free” means a free tier or local inference, not unlimited production usage:

- **OpenRouter** — accepts URL or base64 image inputs; `openrouter/free`
  automatically filters for currently available free models that support image
  understanding. Free models have low and changing rate limits. See [image inputs](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding)
  and the [free router](https://openrouter.ai/docs/guides/routing/routers/free-router).
- **Groq** — has a free plan and supports image understanding with a
  vision-capable model such as `qwen/qwen3.6-27b`; the default in this project
  is configured accordingly. See [Groq vision](https://console.groq.com/docs/vision)
  and [rate limits](https://console.groq.com/docs/rate-limits).
- **Replicate** - runs the pinned [MiniCPM-V model](https://replicate.com/sai88uk/minicpm-v-45-v9),
  which accepts image and video inputs. Mosaic currently sends one resized image
  per request; video files are still skipped by the scanner.
For this app, Groq is the preferred hosted default and OpenRouter is useful when
you want to swap free models. Never put provider keys in `NEXT_PUBLIC_` variables
or commit them to the repository.

## Limitations

### Hosted-site AI limitation

To fully experience Mosaic's capabilities, the hosted site needs access to an
AI provider API. We are students and are not able to provide a shared API key
or maintain the paid credits required to run that service for everyone. We are
truly sorry for this limitation. Please configure your own provider key for
the complete experience, or run the project locally with your own supported
provider.

- Each analysis accepts up to 50 files, with a combined upload limit of 250 MB
  and a 50 MB limit per file.
- Creative briefs must contain between 5 and 2,000 characters.
- Video files and unsupported formats are skipped during scanning.
- PDF text analysis works without external tools, but PDF thumbnails require
  GraphicsMagick or ImageMagick.
- AI enrichment is optional and provider-dependent. It analyzes up to
  `MOSAIC_VISION_MAX_FILES` references and uses up to four concurrent requests
  by default.
- Provider rate limits can trigger retries, reduced concurrency, and
  deterministic fallback analysis. AI results are advisory and may vary by
  provider or model; paid APIs can improve availability but do not guarantee
  fixed response times.
- A personal API key does not guarantee AI enrichment: it must match the
  selected provider, and unsupported, invalid, rate-limited, or timed-out
  requests fall back to deterministic analysis. Cards labeled `VISUAL` indicate
  this fallback; `AI VISION`, `AI TEXT`, or `MIXED` indicate successful AI
  enrichment. After correcting the provider or API key, you may need to rerun
  the analysis for the AI enrichment to appear. Gemini and OpenRouter keys are
  not currently available in the provider selector.
- Without an AI provider/API key, semantic prompt interpretation, image
  enrichment, and richer reference explanations are limited. The deterministic
  local analysis remains available.
- Uploaded source files are ephemeral. Cross-device persistence is not currently
  available because the project intentionally has no hosted database.

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

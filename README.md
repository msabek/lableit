<p align="center">
  <img src="assets/logo.svg" alt="Lableit" width="540" />
</p>

<p align="center"><strong>SAM3-powered vision annotation platform for images and videos.</strong></p>

<p align="center">
  Upload media, describe objects with natural-language text prompts, review the
  detections on an interactive canvas, and export annotations in 8 dataset
  formats (COCO, YOLO detect/segment, Pascal VOC, PNG masks, CreateML, TFRecord, LabelMe).
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-6366f1"></a>
  <img alt="Runtime: Bun 1.3" src="https://img.shields.io/badge/runtime-Bun%201.3-14151a">
  <img alt="Model: SAM3" src="https://img.shields.io/badge/model-SAM3-8b5cf6">
  <img alt="Python 3.11" src="https://img.shields.io/badge/python-3.11-22d3ee">
</p>

> **License at a glance.** Lableit is **free for noncommercial use** (research,
> teaching, evaluation, personal projects) under the
> [PolyForm Noncommercial License 1.0.0](./LICENSE). **Commercial use requires a
> paid license** — see [`LICENSE-COMMERCIAL.md`](./LICENSE-COMMERCIAL.md). The
> SAM3 model is governed separately by **Meta's SAM License** (see
> [Models & AI license](#models--ai-license)).

---

## Table of contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quickstart (local development)](#quickstart-local-development)
- [Configuration (environment variables)](#configuration-environment-variables)
- [Downloading the SAM3 model](#downloading-the-sam3-model)
- [Running without a GPU](#running-without-a-gpu)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Export formats](#export-formats)
- [Security](#security)
- [Models & AI license](#models--ai-license)
- [License](#license)
- [Citation](#citation)
- [Acknowledgements](#acknowledgements)

---

## Screenshots

> The annotation workspace requires sign-in (Clerk) and a running backend; the
> public landing page is shown below.

<p align="center">
  <img src="assets/screenshots/lableit-landing-hero.png" alt="Lableit landing — AI-powered image labeling" width="900" />
</p>

| Features | Try-it demo | Export formats |
|:---:|:---:|:---:|
| <img src="assets/screenshots/lableit-landing-features.png" alt="Features" width="280"> | <img src="assets/screenshots/lableit-landing-demo.png" alt="Interactive demo" width="280"> | <img src="assets/screenshots/lableit-landing-exports.png" alt="Export formats" width="280"> |

## Features

- **Text-prompt object detection** — type `person, car, dog` and SAM3 segments all instances.
- **Interactive canvas** — draw/adjust boxes, render masks, per-class confidence thresholds.
- **4-step workflow** — Upload → Prompt → Review → Export.
- **Image & video** — extract video frames (ffmpeg) on a timeline; annotate frames.
- **8 export formats** — COCO, YOLO (detect + segment), Pascal VOC, PNG masks, CreateML, TFRecord, LabelMe.
- **Projects, classes, tags** — organize assets; CSV import/export of class definitions.
- **Clerk authentication** — sign in with Google OAuth.
- **Theming** — light/dark/system + palette styles (indigo, ocean, sunset, forest).
- **Background jobs** — video slicing, batch inference, and export run on a BullMQ/Redis worker.

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Web UI    │◄────►│  API Server │◄────►│  SAM3       │
│  (React)    │      │  (Fastify)  │      │  Inference  │
│  Clerk Auth │      │  Clerk JWT  │      │  (FastAPI)  │
│  :3000      │      │  :3001      │      │  :8001      │
└─────────────┘      └──────┬──────┘      └─────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
       ┌─────────┐    ┌─────────┐    ┌─────────┐
       │ Postgres │    │  Redis  │    │  MinIO  │
       │  :5433   │    │  :6380  │    │  :9000  │
       └─────────┘    └─────────┘    └─────────┘
```

| Service | Stack | Path |
|---------|-------|------|
| Web | Bun + Vite 8 + React 18 + Clerk + GSAP + Tailwind | `apps/web` |
| API | Bun + Fastify 5 + Prisma + BullMQ + AWS SDK v3 (S3) | `apps/api` |
| Inference | FastAPI + SAM3 (Python) | `apps/inference` |
| Shared | TypeScript types/schemas | `packages/shared` |
| Infra | Docker Compose: Postgres, Redis, MinIO | `infra` |

The API is the only public surface. All inference requests are proxied API → inference;
the inference service is **not** meant to be exposed directly (see [Security](#security)).

## Prerequisites

| Tool | Version | Needed for |
|------|---------|-----------|
| **Bun** | 1.3.12+ | runtime + package manager for web & API |
| **Node.js** | 20.19+ or 22.12+ | optional — only if you run Vite under Node instead of Bun |
| **Python** | 3.11 | inference service |
| **uv** | latest | Python dependency installer |
| **Docker** | Compose v2 | local Postgres/Redis/MinIO (and full self-host) |
| **ffmpeg** | any recent | slicing videos into frames |
| **NVIDIA GPU + CUDA** | — | **required for SAM3 inference** (see [Running without a GPU](#running-without-a-gpu)) |

Install ffmpeg: `brew install ffmpeg` (macOS) · `sudo apt install ffmpeg` (Debian/Ubuntu) ·
`winget install Gyan.FFmpeg` (Windows).

## Quickstart (local development)

> Run each service in its **own terminal** — they are long-running processes.
> Commands are cross-platform unless a line is marked for a specific OS.

### 1. Clone and configure

```bash
git clone https://github.com/msabek/lableit.git
cd lableit

# Copy the env template and fill in your values (at minimum the Clerk keys)
cp .env.example .env
```

### 2. Start infrastructure (Postgres, Redis, MinIO)

```bash
docker compose -f infra/docker-compose.yml up -d
```

This also creates the MinIO bucket automatically.

### 3. Install JS dependencies (web + API + shared)

```bash
bun install
```

### 4. Set up the database

```bash
cd apps/api
bunx prisma generate
bunx prisma migrate deploy   # applies the committed migration to your local DB
cd ..
```

### 5. Install Python / SAM3 dependencies

```bash
cd apps/inference
python3.11 -m venv .venv

# Activate the virtualenv:
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows (PowerShell/cmd)

# Install PyTorch (pick the CUDA build matching your GPU/driver):
uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install the rest (includes the pinned SAM3 package):
uv pip install -r requirements.txt
cd ../..
```

### 6. Run the services (three terminals)

```bash
# Terminal 1 — API (http://localhost:3001)
bun run dev:api

# Terminal 2 — Inference (http://localhost:8001)
cd apps/inference && source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8001

# Terminal 3 — Web (http://localhost:3000)
bun run dev:web
```

Open <http://localhost:3000>.

> **Windows users:** `run.bat` provides a guided menu to start/stop infra, API,
> web, and inference and to install ffmpeg. It is Windows-only; on macOS/Linux
> use the `bun run dev:*` commands above.

### Clerk setup

1. Create a free account at <https://clerk.com> and a new application.
2. Enable **Google** as a social connection.
3. From the [Clerk API keys page](https://dashboard.clerk.com/last-active?path=api-keys),
   copy your **Publishable key** and **Secret key**.
4. Put them in the root `.env`:
   - `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`
   - `CLERK_SECRET_KEY=sk_test_...`

## Configuration (environment variables)

Templates: root [`.env.example`](./.env.example) (full local stack),
[`apps/api/.env.example`](./apps/api/.env.example) (API-only),
[`.env.production`](./.env.production) and [`.env.railway.example`](./.env.railway.example)
(deployment).

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | — | Clerk publishable key (frontend) |
| `CLERK_SECRET_KEY` | — | Clerk secret key (backend) |
| `DATABASE_URL` | `postgresql://lableit:lableit@localhost:5433/lableit` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6380` | Redis (BullMQ) |
| `INFERENCE_URL` | `http://localhost:8001` | Inference service base URL |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | MinIO defaults | S3-compatible object storage |
| `JWT_SECRET` | — (**required**) | Signing secret; the API fails fast in production if unset |
| `INFERENCE_ALLOWED_ORIGINS` | `*` | CORS allowlist for the inference service |
| `INFERENCE_SHARED_SECRET` | — | Optional shared secret required between API and inference |
| `INFERENCE_TIMEOUT_MS` | `60000` | Per-request inference timeout |
| `INFERENCE_BATCH_TIMEOUT_MS` | `300000` | Per-asset batch inference timeout |
| `INFERENCE_MAX_RETRIES` | `3` | Inference retry attempts |
| `WORKER_MODE` | `false` | `true` = standalone BullMQ worker (no HTTP listener) |
| `RUN_WORKER` | dev only | embed a worker in the API process |
| `RUN_HTTP_SERVER` | `true` | `false` disables the API HTTP listener |
| `FFMPEG_PATH` | `ffmpeg` | path to the ffmpeg binary |
| `HF_TOKEN` | — | optional HuggingFace token (model-download fallback) |

## Downloading the SAM3 model

The SAM3 weights (~2–4 GB) are **not** bundled — download them yourself and
accept Meta's SAM License:

- **ModelScope** (primary, no authentication)
- **HuggingFace** (fallback, needs `HF_TOKEN`)

Download via the **Settings** panel in the UI, or:

```bash
python apps/inference/download_models.py
```

A `model_config.json` is generated locally on first download (it is gitignored;
see [`model_config.example.json`](./apps/inference/model_config.example.json)).

## Running without a GPU

SAM3 requires an **NVIDIA GPU with CUDA**. With no GPU detected:

- AI inference is unavailable.
- **Manual annotation (boxes/polygons) still works.**
- Projects, assets, and all 8 exports remain fully functional.
- The UI shows a clear "limited mode" message.

> Cloud platforms without GPUs (e.g. Railway) run the inference service in this
> limited mode. See [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md).

## Deployment

- **Docker Compose (self-hosted):** [`DEPLOYMENT.md`](./DEPLOYMENT.md)

  ```bash
  cp .env.production .env   # then edit with real values (incl. Clerk keys)
  docker compose -f docker-compose.prod.yml up -d --build
  ```

  The API container runs `prisma migrate deploy` on startup.

- **Railway (cloud):** [`RAILWAY_DEPLOYMENT.md`](./RAILWAY_DEPLOYMENT.md). Railway
  detects the monorepo and builds a service per app; configure the variables from
  [`.env.railway.example`](./.env.railway.example).

## Documentation

| Doc | Contents |
|-----|----------|
| [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) | End-to-end annotation workflow |
| [`docs/API.md`](./docs/API.md) | REST API reference (every route) |
| [`docs/EXPORT_FORMATS.md`](./docs/EXPORT_FORMATS.md) | Each export format + directory layout |
| [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) | GPU, model download, ffmpeg, DB, ports |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Dev setup & contribution workflow |
| [`SECURITY.md`](./SECURITY.md) | Vulnerability reporting & hardening |
| [`structure.md`](./structure.md) | Repository layout reference |

## Export formats

8 selectable format IDs (`GET /export/formats`): `coco`, `yolo_detect`,
`yolo_segment`, `voc`, `png_masks`, `createml`, `tfrecord_meta`, `labelme`.
Exports bundle the project images plus the format-specific annotation files into a
single timestamped ZIP. Details: [`docs/EXPORT_FORMATS.md`](./docs/EXPORT_FORMATS.md).

## Security

- The **inference service ships with no authentication** and trusts its network
  boundary. **Run it on a private network behind the API only** — never expose it
  publicly. Optionally set `INFERENCE_SHARED_SECRET` to require a shared header
  between API and inference, and `INFERENCE_ALLOWED_ORIGINS` to restrict CORS.
- The API enforces Clerk JWT auth, per-resource ownership checks, input
  validation, security headers (helmet), and time-limited export tokens.
- Report vulnerabilities privately — see [`SECURITY.md`](./SECURITY.md).

## Models & AI license

Lableit builds on **SAM3** by Meta. **Both** the SAM3 model weights **and** the
`sam3` Python package are licensed under Meta's **SAM License** — a custom,
non-OSI license with restrictions (including acceptable-use, redistribution, and
trade-control terms). Lableit does **not** redistribute the weights; you download
and accept Meta's license yourself. Lableit's own license does not extend to SAM
Materials. See [`NOTICE`](./NOTICE) and
[`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md).

## License

Lableit is **dual-licensed**:

- **Noncommercial:** [PolyForm Noncommercial License 1.0.0](./LICENSE) — free for
  research, education, evaluation, and personal use.
- **Commercial:** a paid license is required for any commercial use —
  [`LICENSE-COMMERCIAL.md`](./LICENSE-COMMERCIAL.md).

Third-party components retain their own licenses — [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md).

## Citation

If you use Lableit in academic work, please cite it (and SAM3). Citation metadata:
[`CITATION.cff`](./CITATION.cff).

## Acknowledgements

Created by **Mohammed Sabek** — **IHT Lab**, Department of Civil and Environmental
Engineering, **University of Alberta**, Edmonton, Canada. Built on
[SAM3](https://ai.meta.com/sam) by Meta AI.

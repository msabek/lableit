<p align="center">
  <img src="assets/logo.svg" alt="Lableit" width="540" />
</p>

<p align="center"><strong>Describe what you want. Let SAM3 label it. Review, correct, export.</strong></p>

<p align="center">
  Lableit is a self-hosted annotation platform for images and video. Type
  <code>car, person, wheel</code>, and Meta's <strong>SAM3</strong> finds and outlines every
  match on your media. You review the results on an interactive canvas and export
  the dataset in <strong>8 formats</strong>, including COCO, YOLO and Pascal VOC.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: academic use only" src="https://img.shields.io/badge/license-academic%20use%20only-6366f1"></a>
  <img alt="Version 1.0.0" src="https://img.shields.io/badge/version-1.0.0-4f46e5">
  <img alt="Runtime: Bun 1.3" src="https://img.shields.io/badge/runtime-Bun%201.3-14151a">
  <img alt="Model: SAM3" src="https://img.shields.io/badge/model-SAM3-8b5cf6">
  <img alt="Python 3.11+" src="https://img.shields.io/badge/python-3.11%2B-22d3ee">
  <img alt="CUDA, Apple Silicon or CPU" src="https://img.shields.io/badge/runs%20on-CUDA%20%7C%20Apple%20Silicon%20%7C%20CPU-0ea5e9">
</p>

<p align="center">
  <img src="assets/screenshots/app-detection.jpg" alt="SAM3 text-prompt detection on the Lableit canvas: one car, four wheels and six windows found from a single prompt" width="900">
</p>
<p align="center"><em>One prompt, eleven objects found and outlined. You review and correct, instead of drawing.</em></p>

> **License in one line.** Lableit is **free for academic use** (teaching, learning
> and non-commercial research at universities and non-profit research institutes)
> under the [Lableit Academic Research License](./LICENSE). **Every other use needs
> written permission first**, see [`PERMISSIONS.md`](./PERMISSIONS.md). The SAM3 model
> itself is covered by **Meta's separate SAM License**.

---

## Why this exists

Hand-labeling is the slowest, most expensive part of building a computer-vision
dataset. Drawing thousands of boxes by hand takes weeks, and it is the kind of work
that quietly eats a research schedule.

Lableit flips the job around:

| Traditional labeling | With Lableit |
|---|---|
| Draw every box and outline by hand | Type the objects you want in plain words |
| Repeat for every image | Run one prompt across the whole project |
| Quality depends on stamina | The model proposes, **you stay the judge** |
| Format conversion is a separate chore | Export to 8 dataset formats in one click |

Lableit was built by **Mohamed Sabek** during his PhD research at the **IHT Lab**
(Infrastructure and Human Tech Lab), Department of Civil and Environmental
Engineering, **University of Alberta**, Edmonton, Canada.

This class of semi-automatic labeling technology, alongside other tools, is what
made the **CIVAD** dataset practical: the **Construction Industry Vision Alberta
Dataset**, over 50 object classes across more than 86,905 images of construction
tools, machinery, safety equipment and materials
([ISARC 2025 paper](https://doi.org/10.22260/ISARC2025/0124)). We are releasing
Lableit because labeling effort is a problem every vision researcher shares.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [The workflow, in pictures](#the-workflow-in-pictures)
- [What Lableit can do](#what-lableit-can-do)
- [No accounts, and what that means](#no-accounts-and-what-that-means)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quickstart (local development)](#quickstart-local-development)
- [Configuration (environment variables)](#configuration-environment-variables)
- [Downloading the SAM3 model](#downloading-the-sam3-model)
- [Devices (CUDA, Apple Silicon, CPU)](#devices-cuda-apple-silicon-cpu)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Security](#security)
- [Models and AI license](#models-and-ai-license)
- [License](#license)
- [Citation](#citation)
- [Acknowledgements](#acknowledgements)

---

## The workflow, in pictures

Four steps: **Upload, Label, Review, Export.** Every screenshot below is the real
application running on Apple Silicon with SAM3 loaded.

### 1. Create a project and bring your media

<table>
<tr>
<td width="50%"><img src="assets/screenshots/app-projects.jpg" alt="Projects dashboard listing projects with asset and class counts"></td>
<td width="50%"><img src="assets/screenshots/app-wizard-upload.jpg" alt="Project creation wizard, step one: name the project and upload images or video"></td>
</tr>
<tr>
<td><strong>Projects dashboard.</strong> Every project shows its assets, classes and progress at a glance.</td>
<td><strong>Creation wizard, step 1.</strong> Name the project and drop in images or video. Video is sliced into frames for you.</td>
</tr>
</table>

### 2. Define your classes

<p align="center">
  <img src="assets/screenshots/app-wizard-classes.jpg" alt="Project creation wizard, step two: adding the classes car, wheel and window" width="820">
</p>

Add classes by hand, or import a class list from CSV. Each class carries its own
colour and confidence threshold.

### 3. Label with a text prompt

<p align="center">
  <img src="assets/screenshots/app-workspace.jpg" alt="Labeling workspace showing the four-step bar, inference health with device mps, model settings and the asset list" width="900">
</p>

The workspace is where the work happens:

- **Inference health** shows the model state and the device in use (`mps`, `cuda` or `cpu`).
- **Model settings** choose the output: **boxes only**, **boxes plus masks**, or **masks only**.
- **Run Preview (3 samples)** tries your prompt on a few assets first, so you can tune
  it before spending time on the whole set.
- **Run Batch (all assets)** queues the full project as a background job.

### 4. Review and correct

<p align="center">
  <img src="assets/screenshots/app-detection.jpg" alt="Review canvas with per-object masks, boxes, labels, confidence scores and a deletable annotation list" width="900">
</p>

Every detection arrives with a class, a confidence score and a mask. Delete what is
wrong, draw what is missing, move or resize a box that is close but not right.
**Nothing lands in your dataset that you did not approve.**

### 5. Export your dataset

<table>
<tr>
<td width="50%"><img src="assets/screenshots/app-export-formats.jpg" alt="Export dialog showing all eight dataset formats"></td>
<td width="50%"><img src="assets/screenshots/app-export-done.jpg" alt="Export complete screen with the download ready"></td>
</tr>
<tr>
<td><strong>Pick a format.</strong> Eight of them, each with a plain description of what it is for.</td>
<td><strong>Download.</strong> Images plus annotation files, bundled into one timestamped ZIP.</td>
</tr>
</table>

---

## What Lableit can do

### Labeling and AI

| Capability | Detail |
|---|---|
| **Text-prompt detection** | Type the objects you want (`car, person, wheel`). SAM3 finds every instance, no per-class model training. |
| **Three output modes** | Bounding boxes only, boxes plus segmentation masks, or masks only. |
| **Preview before batch** | Test a prompt on 3 sample assets before running the whole project. |
| **Batch inference** | Runs across every asset as a background job, with progress and retries. |
| **Per-class confidence** | Each class carries its own threshold, so noisy classes can be tightened independently. |
| **Manual annotation** | Draw a box by dragging on the canvas, move or resize it with its handles, and delete any annotation. |
| **Mask rendering** | Masks drawn over the image with an adjustable opacity slider. |

### Media and datasets

| Capability | Detail |
|---|---|
| **Images and video** | Video is sliced into frames with ffmpeg at a frame interval you choose (one frame every N seconds), then annotated frame by frame. |
| **Projects and classes** | Organise assets per project, filter labeled vs unlabeled, page through large sets. Tags can be applied to files as you upload them. |
| **CSV class lists** | Import and export class definitions, so a class scheme can be reused across projects. |
| **8 export formats** | `coco`, `yolo_detect`, `yolo_segment`, `voc`, `png_masks`, `createml`, `tfrecord_meta`, `labelme`. |
| **One ZIP per export** | Your images plus the format-specific annotation files, timestamped, behind a single-use download link. |

Two honest notes: `png_masks` currently exports a per-class colour map and
per-image mask metadata, not rendered PNG masks; and `tfrecord_meta` ships
metadata plus a Python script that writes the `.tfrecord` file when you run it.
Full details and directory layouts: [`docs/EXPORT_FORMATS.md`](./docs/EXPORT_FORMATS.md).

### Platform

| Capability | Detail |
|---|---|
| **Runs on your hardware** | NVIDIA CUDA, Apple Silicon GPU (MPS) or plain CPU. Nothing is sent to a third-party labeling service. |
| **Background jobs** | Video slicing, batch inference and exports run on a Redis / BullMQ worker, so the browser is never blocked. |
| **No sign-in** | Clone it, run it, start labeling. No accounts, no API keys for auth, nothing to configure. |
| **Themes** | Light (default), dark or follow-the-system, plus four colour palettes: indigo, ocean, sunset and forest. |
| **Keyboard shortcuts** | For upload, selection, inference and export, see the table below. |

<p align="center">
  <img src="assets/screenshots/app-theme.jpg" alt="Theme menu with light, dark and system modes plus four colour palettes" width="820">
</p>

---

## No accounts, and what that means

**Lableit has no login, no user accounts and no permissions.** It is meant to be
run by you, on your own machine or on a server you control. Everything you create
lives in one shared workspace, and the app opens straight into your projects.

That makes it trivial to get started, and it has one consequence worth stating
plainly:

> **Anyone who can reach the app can read, change and delete everything in it.**
> Run it locally (the default, `localhost`), or put it behind your institution's
> VPN, an SSH tunnel, or an authenticating reverse proxy before exposing it to a
> network. Do not put this on the open internet as-is.

If you need multi-user separation, that is a fork-and-build-it situation: the
database still carries an owner column on every project, so the hook is there.

---

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Web UI    │◄────►│  API Server │◄────►│  SAM3       │
│  (React)    │      │  (Fastify)  │      │  Inference  │
│  no login   │      │  no auth    │      │  (FastAPI)  │
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
| Web | Bun + Vite + React 18 + GSAP + Tailwind | `apps/web` |
| API | Bun + Fastify 5 + Prisma + BullMQ + AWS SDK v3 (S3) | `apps/api` |
| Inference | FastAPI + SAM3 (Python) | `apps/inference` |
| Shared | TypeScript types and schemas | `packages/shared` |
| Infra | Docker Compose: Postgres, Redis, MinIO | `infra` |

- **Postgres** stores users, projects, assets, tags, class definitions, annotations and jobs.
- **Redis** carries the job queue (video slicing, batch inference, exports).
- **MinIO** (or any S3-compatible storage) holds the media, served to the browser through time-limited presigned links.

The API is the only public surface. All inference requests are proxied from the API
to the inference service, which is **not** meant to be exposed directly, see
[Security](#security).

---

## Prerequisites

| Tool | Version | Needed for |
|------|---------|-----------|
| **Bun** | 1.3.12+ | runtime and package manager for web and API |
| **Node.js** | 20.19+ or 22.12+ | optional, only if you run Vite under Node instead of Bun |
| **Python** | 3.11+ | inference service (the macOS setup script builds a 3.12 environment) |
| **uv** | latest | Python dependency installer |
| **Docker** | Compose v2 | local Postgres 16, Redis 7 and MinIO, and full self-hosting |
| **ffmpeg** | any recent | slicing videos into frames |
| **NVIDIA GPU + CUDA** | optional | fastest SAM3 inference. Not required: Apple Silicon and CPU both work. |

Install ffmpeg: `brew install ffmpeg` (macOS), `sudo apt install ffmpeg`
(Debian/Ubuntu), `winget install Gyan.FFmpeg` (Windows).

---

## Quickstart (local development)

> Run each service in its **own terminal**, they are long-running processes.
>
> **macOS one-click:** **`run.command`** does the whole thing. On first run it
> creates `.env`, installs dependencies, creates a local Postgres cluster with the
> `lableit` role and database, applies the migrations, then starts the database,
> cache, storage, API, inference and web services, opens the app, and stops
> everything on Ctrl+C. It does **not** use Docker, so install its three native
> pieces first:
>
> ```bash
> brew install postgresql@16 redis
> brew install minio/stable/minio   # or drop a minio binary at .devstack/bin/minio
> cd apps/inference && bash setup_mac.sh && cd ../..   # SAM3 environment
> ```
>
> If a service fails to start it says which one and prints the last lines of its
> log, rather than claiming success. Logs live in `.devstack/logs/`.
> Prefer Docker? Follow the numbered steps below instead.
> **Windows:** `run.bat` gives you a guided menu and uses Docker.

### 1. Clone and configure

```bash
git clone https://github.com/msabek/lableit.git
cd lableit

# Copy the env template. The defaults work for a local stack as-is.
cp .env.example .env
```

### 2. Start infrastructure (Postgres, Redis, MinIO)

```bash
docker compose -f infra/docker-compose.yml up -d
```

This also creates the MinIO bucket automatically.

### 3. Install JS dependencies (web, API, shared)

```bash
bun install
```

### 4. Set up the database

```bash
cd apps/api
bunx prisma generate
bunx prisma migrate deploy   # applies the committed migrations to your local DB
cd ../..
```

### 5. Install Python / SAM3 dependencies

SAM3 is written for CUDA, so the install differs slightly per platform. SAM3 is
always installed with `--no-deps` (its pinned `numpy<2` conflicts with the stack,
and `triton` has no macOS build); the launchers handle this for you.

**macOS / Apple Silicon (or Linux CPU):**

```bash
cd apps/inference
bash setup_mac.sh     # creates .venv, installs torch + deps + SAM3, patches triton
cd ../..
```

**Windows / Linux with an NVIDIA GPU:** use `run.bat` (Windows), or:

```bash
cd apps/inference
python3.11 -m venv .venv
.venv\Scripts\activate                  # Windows, or: source .venv/bin/activate
uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
uv pip install -r requirements.txt
uv pip install triton-windows
uv pip install --no-deps "sam3 @ git+https://github.com/facebookresearch/sam3.git@c97c893969003d3e6803fd5d679f21e515aef5ce"
cd ../..
```

### 6. Run the services (three terminals)

```bash
# Terminal 1 - API (http://localhost:3001)
bun run dev:api

# Terminal 2 - Inference (http://localhost:8001)
cd apps/inference && ./.venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001

# Terminal 3 - Web (http://localhost:3000)
bun run dev:web
```

Open <http://localhost:3000>.

## Configuration (environment variables)

Templates: root [`.env.example`](./.env.example) (full local stack),
[`apps/api/.env.example`](./apps/api/.env.example) (API only),
[`.env.production`](./.env.production) and [`.env.railway.example`](./.env.railway.example)
(deployment).

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | none | Comma-separated browser origins allowed to call the API cross-origin. |
| `DATABASE_URL` | `postgresql://lableit:lableit@localhost:5433/lableit` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6380` | Redis (BullMQ) |
| `INFERENCE_URL` | `http://localhost:8001` | Inference service base URL |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | MinIO defaults | S3-compatible object storage. Must be reachable from the browser, because media is served through presigned links. |
| `INFERENCE_ALLOWED_ORIGINS` | `*` | CORS allowlist for the inference service |
| `INFERENCE_SHARED_SECRET` | none | Reserved. The API does not send this header yet, so leave it unset and keep inference on a private network. |
| `INFERENCE_TIMEOUT_MS` | `60000` | Per-request inference timeout |
| `INFERENCE_BATCH_TIMEOUT_MS` | `300000` | Per-asset batch inference timeout |
| `INFERENCE_MAX_RETRIES` | `3` | Inference retry attempts |
| `WORKER_MODE` | `false` | `true` runs a standalone BullMQ worker with no HTTP listener |
| `RUN_WORKER` | dev only | Embeds a worker in the API process |
| `RUN_HTTP_SERVER` | `true` | `false` disables the API HTTP listener |
| `FFMPEG_PATH` | `ffmpeg` | Path to the ffmpeg binary |
| `LABLEIT_DEVICE` | auto | Force the inference device: `cuda`, `mps` or `cpu` |
| `INFERENCE_USE_AUTOCAST` | off | `1` enables bf16 autocast on CUDA |
| `VITE_API_URL` | `http://localhost:3001` in dev, `/api` otherwise | Where the web app looks for the API |
| `PORT` / `API_HOST` | `3001` / `0.0.0.0` | API listener |
| `S3_REGION` / `LOG_LEVEL` | `us-east-1` / `info` | Storage region and log verbosity |
| `HF_TOKEN` | none | Hugging Face token. `facebook/sam3` is a gated model, so a token with access is needed for the Hugging Face download path. |

---

## Downloading the SAM3 model

The SAM3 weights (about 2.5 GB) are **not** bundled. You download them
yourself and accept Meta's SAM License:

- **ModelScope** (primary, no authentication)
- **Hugging Face** (fallback, gated: needs `HF_TOKEN`)

Download from the **Settings** panel in the UI, or:

```bash
# Use the inference environment's Python: the script needs modelscope /
# huggingface-hub, which live in apps/inference/.venv
apps/inference/.venv/bin/python apps/inference/download_models.py
```

A `model_config.json` is generated locally on first download (it is gitignored, see
[`model_config.example.json`](./apps/inference/model_config.example.json)).

---

## Devices (CUDA, Apple Silicon, CPU)

The inference service picks a device automatically (`cuda`, then `mps`, then `cpu`).
Override it with `LABLEIT_DEVICE`.

| Host | Default device | Notes |
|------|----------------|-------|
| NVIDIA GPU | `cuda` | Fastest. bf16 autocast is **off by default**; enable it with `INFERENCE_USE_AUTOCAST=1`. |
| Apple Silicon (Mac) | `mps` | Uses the Mac's GPU. A compatibility shim adapts SAM3's CUDA-only code to float32; some operations fall back to CPU (`PYTORCH_ENABLE_MPS_FALLBACK=1`), so MPS is not always faster than CPU. |
| Apple Silicon, CPU only | `cpu` | Set `LABLEIT_DEVICE=cpu`. Works out of the box, roughly 6 s per image. |
| No accelerator / cloud CPU | `cpu` | Functional, but slow and memory-heavy on large images. Railway has no GPUs. |

Manual annotation, projects, assets and all 8 exports work regardless of device.
See [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md).

---

## Keyboard shortcuts

These are the shortcuts that are wired up in the labeling workspace today:

| Keys | Action |
|---|---|
| `U` | Upload files |
| `A` / `D` | Select or deselect all assets |
| `Ctrl` + `Shift` + `P` | Run preview on 3 sample assets |
| `Ctrl` + `Enter` | Run batch inference on every asset |
| `Ctrl` + `E` | Open the export wizard |
| `Esc` | Close the preview, or leave the project (a no-op while a dialog is open) |
| `←` `→` | Move between assets while the preview is open |
| `Del` / `Backspace` | Delete the selected annotation (on the canvas) |
| `?` | Show the in-app shortcut list |

The in-app list (press `?`, or the Shortcuts button in the sidebar) shows exactly
these. Annotations save as you make them, so there is no save shortcut to press.

---

## Deployment

- **Docker Compose (self-hosted):** [`DEPLOYMENT.md`](./DEPLOYMENT.md)

  ```bash
  cp .env.production .env   # then edit with real values (S3 credentials, database password)
  docker compose -f docker-compose.prod.yml up -d --build
  ```

  The API container runs `prisma migrate deploy` on startup.

- **Railway (cloud):** [`RAILWAY_DEPLOYMENT.md`](./RAILWAY_DEPLOYMENT.md). Build each
  service from the repository root with its own Dockerfile path, and run the worker
  as its own service: background jobs do not run without it. Railway has no GPUs, so
  host inference elsewhere if you need speed.

---

## Documentation

| Doc | Contents |
|-----|----------|
| [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) | End-to-end annotation workflow |
| [`docs/API.md`](./docs/API.md) | REST API reference (every route) |
| [`docs/EXPORT_FORMATS.md`](./docs/EXPORT_FORMATS.md) | Each export format and its directory layout |
| [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) | GPU, model download, ffmpeg, database, ports |
| [`CHANGELOG.md`](./CHANGELOG.md) / [`CHANGELOG.html`](./CHANGELOG.html) | What changed, in text and in pictures |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Dev setup and contribution workflow |
| [`SECURITY.md`](./SECURITY.md) | Vulnerability reporting and hardening |
| [`structure.md`](./structure.md) | Repository layout reference |

---

## Security

- The **inference service ships with no authentication** and trusts its network
  boundary. **Run it on a private network behind the API only**, never expose it
  publicly. It will also fetch any image URL it is handed, which is a second
  reason to keep it off the public internet. `INFERENCE_ALLOWED_ORIGINS` restricts
  its CORS.
- **There is no authentication.** Every API route is open to whoever can reach the
  port. This is deliberate for a tool you run yourself, and it is the single most
  important thing to know before putting it anywhere other than `localhost`.
- The API still validates input, scopes classes and tags to their project, pins
  video slicing to the project's own storage prefix, sets security headers
  (helmet), rate-limits per IP and route, and hands out single-use, time-limited
  export download tokens.
- Report vulnerabilities privately, see [`SECURITY.md`](./SECURITY.md).

---

## Models and AI license

Lableit builds on **SAM3** by Meta. **Both** the SAM3 model weights **and** the
`sam3` Python package are licensed under Meta's **SAM License**, a custom, non-OSI
license with restrictions (acceptable use, redistribution and trade-control terms).
Lableit does **not** redistribute the weights: you download them and accept Meta's
license yourself. Lableit's own license does not extend to SAM materials. See
[`NOTICE`](./NOTICE) and [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md).

---

## License

Lableit is released under the **[Lableit Academic Research License 1.0](./LICENSE)**:

- **Academic use: free.** Use, study, modify and share Lableit for teaching,
  learning and non-commercial research, keeping the notices and citing it.
- **Every other use** (commercial, industrial, client work, hosted services for
  other people, government operational use) **needs written permission first**.
  See [`PERMISSIONS.md`](./PERMISSIONS.md). We are happy to say yes, we just want
  to be asked.

Third-party components keep their own licenses, see
[`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md).

---

## Citation

If Lableit helps your research, please cite it. Machine-readable metadata lives in
[`CITATION.cff`](./CITATION.cff).

Please also cite **SAM 3** (arXiv:2511.16719), which does the segmentation, and the
**CIVAD** paper if you refer to the dataset:

> Sabek, M., Mei, Q., Lee, G., Golabchi, A., and Gonzalez, V. (2025).
> *Construction Industry Vision Alberta Dataset (CIVAD): Developing a Comprehensive
> Object Detection Dataset for Diverse Construction Applications.*
> Proceedings of the 42nd International Symposium on Automation and Robotics in
> Construction (ISARC 2025), Montreal, Canada, pp. 956-963.
> <https://doi.org/10.22260/ISARC2025/0124>

---

## Acknowledgements

<p align="center">
  <img src="assets/screenshots/landing-attribution.jpg" alt="IHT Lab attribution on the Lableit landing page" width="620">
</p>

Created by **Mohamed Sabek** during his PhD research at the **IHT Lab**
(Infrastructure and Human Tech Lab), Department of Civil and Environmental
Engineering, **University of Alberta**, Edmonton, Canada.

With thanks to the supervisors and colleagues who made the research, and the CIVAD
dataset it supported, possible: **Qipei Mei**, **Gaang Lee**, **Ali Golabchi** and
**Vicente Gonzalez**, and to everyone at the IHT Lab who tested, questioned and
improved this tool.

Built on [SAM3](https://ai.meta.com/sam) by Meta AI.

# Lableit Troubleshooting

Common problems and how to resolve them. Commands are given for macOS/Linux and
Windows where they differ.

---

## No GPU / "limited mode" (automatic detection unavailable)

**Symptom:** Manual annotation, upload, video slicing, and export all work, but
SAM3 text-prompt detection returns nothing or the inference health/status shows
the model as unavailable. Batch inference may abort with a message like
"SAM3 model not available".

**Cause:** SAM3 **requires an NVIDIA CUDA GPU**. The `sam3` library has hardcoded
`device="cuda"` paths, so when no compatible CUDA GPU is detected, the inference
service starts in **limited mode**: it serves health/status/config endpoints,
but cannot run detection. (Notably, **Railway has no GPUs**, so inference there
runs in limited/unavailable mode, see `RAILWAY_DEPLOYMENT.md`.)

**What still works without a GPU:**
- Projects, classes, tags
- Upload images/videos, video slicing (ffmpeg, CPU)
- Manual box/mask annotation on the canvas
- All export formats

**To enable automatic detection:**
- Run `apps/inference` on a machine with a CUDA-capable NVIDIA GPU.
- Install a CUDA-enabled PyTorch build (on Windows, `run.bat` preserves the
  CUDA wheel selection; for RTX 50-series / Blackwell GPUs use a `cu128` build).
- Check `GET /inference/gpu` (or the API's `GET /inference/gpu`): `cuda` should
  be available and the device name listed.

---

## Model download issues (ModelScope / Hugging Face / HF_TOKEN)

**Symptom:** SAM3 weights never finish downloading, or the inference service
reports the model as not downloaded.

**How downloads work:** `apps/inference/download_models.py` tries **ModelScope
first** (no auth required), then falls back to **Hugging Face**.

**Fixes:**
- Trigger a download via `POST /inference/models/sam3/download` (or the API's
  `POST /inference/models/:modelId/download`) and poll
  `GET /inference/models/sam3/download/status`.
- Or run the downloader directly from `apps/inference`:
  ```bash
  uv run python download_models.py
  ```
- If ModelScope is blocked/unreachable and the Hugging Face repo requires
  authentication, set an `HF_TOKEN` environment variable so the fallback can
  authenticate:
  - macOS/Linux: `export HF_TOKEN=hf_xxx`
  - Windows (PowerShell): `$env:HF_TOKEN = "hf_xxx"`
- Ensure `git` is installed, the pinned `sam3` package is installed from GitHub.
- Confirm there is enough disk space and that the model cache directory
  (`MODEL_CACHE_DIR`, e.g. `/app/models`) is writable.

> Lableit does **not** redistribute SAM3 weights; you download them and accept
> Meta's SAM License yourself.

---

## ffmpeg not found (video slicing fails)

**Symptom:** Video slicing jobs fail; logs reference `ffmpeg`.

**Cause:** ffmpeg is required to extract frames and is not on `PATH`.

**Fixes - install ffmpeg:**
- macOS: `brew install ffmpeg`
- Linux (Debian/Ubuntu): `sudo apt-get install -y ffmpeg`
- Windows: `winget install Gyan.FFmpeg` or `choco install ffmpeg` (or use
  `run.bat` option **[F]**)

If ffmpeg is installed in a non-standard location, set `FFMPEG_PATH` to the
executable:
- macOS/Linux: `export FFMPEG_PATH=/usr/local/bin/ffmpeg`
- Windows: `$env:FFMPEG_PATH = "C:\\ffmpeg\\bin\\ffmpeg.exe"`

Verify with `ffmpeg -version`.

---

## Database / migration errors

**Symptom:** API exits on startup with a database connection error, or routes
fail with Prisma "table does not exist" errors.

**Fixes:**
- Confirm Postgres is running and reachable on **port 5433** locally:
  ```bash
  docker compose -f infra/docker-compose.yml ps
  ```
- Verify `DATABASE_URL`. The local default is
  `postgresql://lableit:lableit@localhost:5433/lableit`.
- Apply migrations (from `apps/api`):
  ```bash
  bunx prisma generate
  bunx prisma migrate deploy
  ```
  Use `bunx prisma migrate dev` only when creating a new migration in
  development (it is interactive).
- In production, the API **fails fast** if `DATABASE_URL`, `REDIS_URL`,
  `INFERENCE_URL`, or `S3_*` are missing, set them all.

---

## MinIO / S3 bucket issues

**Symptom:** Uploads or signed-URL requests fail; "bucket does not exist" or S3
connection errors.

**Fixes:**
- Confirm MinIO is running (API on **9000**, console on **9001**):
  ```bash
  curl -f http://localhost:9000
  ```
  Console: http://localhost:9001 (local dev credentials: `minioadmin` /
  `minioadmin`).
- Ensure the bucket named by `S3_BUCKET` (default `lableit`) exists. Create it
  in the MinIO console if needed.
- Check `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`. The client
  uses path-style addressing, which MinIO requires.
- For external providers (R2/AWS S3), set the matching `S3_ENDPOINT`/`S3_REGION`
  and configure bucket CORS for your web origin.

---

## Port conflicts (5433 / 6380 / 3000 / 3001 / 8001 / 9000 / 9001)

**Symptom:** A service fails to bind ("address already in use").

**Why these ports:** Lableit deliberately uses **PostgreSQL on 5433** and
**Redis on 6380** (instead of the defaults 5432/6379) to avoid conflicting with
existing local installs, this is common on Windows where a system PostgreSQL or
Redis may already occupy the default port.

**Fixes:**
- Find what is using a port:
  - macOS/Linux: `lsof -i :5433` (or `:3001`, `:8001`, etc.)
  - Windows (PowerShell): `netstat -ano | findstr :5433`
- Stop the conflicting process, or change the host-side port mapping in
  `infra/docker-compose.yml` and update the corresponding env var
  (`DATABASE_URL`, `REDIS_URL`, etc.).

Default ports:

| Service | Port |
|---------|------|
| Web | 3000 |
| API | 3001 |
| Inference | 8001 |
| PostgreSQL | 5433 |
| Redis | 6380 |
| MinIO API / Console | 9000 / 9001 |

(On Railway, services listen on the platform-provided `$PORT` / `:8080` instead
of these local ports.)

---

## Worker not processing jobs

**Symptom:** Slice/inference/export jobs stay `queued` and never run.

**Fixes:**
- Confirm Redis is up: `docker compose -f infra/docker-compose.yml exec redis redis-cli ping`
- In development the API embeds a worker by default. In production, run a
  dedicated worker service with `WORKER_MODE=true` (and `RUN_HTTP_SERVER=false`),
  or set `RUN_WORKER=true` on the API to embed one.
- Check worker logs for errors and verify `REDIS_URL` matches across API and
  worker.

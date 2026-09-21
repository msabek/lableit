# Contributing to Lableit

Thanks for your interest in contributing to Lableit, a SAM3-powered vision
annotation platform. This guide covers the development environment, how to run
each service, and the conventions for branches, PRs, and code style.

## License of contributions

Lableit is released under the **Lableit Academic Research License 1.0** (see
[`LICENSE`](./LICENSE)): academic use only, other uses by written permission
(see [`PERMISSIONS.md`](./PERMISSIONS.md)).

By submitting a contribution (pull request, patch, or issue attachment), you
confirm that you wrote it or have the right to submit it, you license it under
the project's license, and you also grant Mohamed Sabek the right to include it
in any written permission he gives for non-academic use of Lableit. If you
cannot agree to this, please open an issue to discuss before contributing.

## Repository layout

Lableit is a monorepo:

- `apps/api` — Bun + Fastify + Prisma + BullMQ + AWS SDK v3 (S3) backend
- `apps/web` — Vite 8 + React 18 + Clerk + GSAP + Tailwind frontend
- `apps/inference` — FastAPI + SAM3 Python inference service
- `packages/shared` — shared TypeScript types
- `infra/docker-compose.yml` — local Postgres, Redis, MinIO

See [`structure.md`](./structure.md) for a detailed map.

## Development environment

You need:

- **Bun 1.3.12+** — runtime, package manager, and task runner for `apps/api`,
  `apps/web`, and `packages/shared`.
- **Node 20.19+ or 22.12+** — only required to run **Vite** under Node (Vite 8's
  engine requirement). Bun runs the API directly; Node is not otherwise needed.
- **Python 3.11** — canonical version for `apps/inference` (SAM3). Use `uv` to
  manage the virtual environment and install dependencies.
- **uv** — Python package/installer used for the inference service
  (`uv pip install -r apps/inference/requirements.txt`).
- **ffmpeg** — required for video-to-frame slicing.
- **Docker** — for local infrastructure (Postgres, Redis, MinIO) via
  `infra/docker-compose.yml`.
- **An NVIDIA CUDA GPU** — required to actually run SAM3 inference. Without a
  GPU the platform runs in "limited mode": manual annotation, project
  management, and export all work, but automatic detection is unavailable.

### Local ports

| Service | Port |
|---------|------|
| Web (Vite dev server) | 3000 |
| API | 3001 |
| Inference | 8001 |
| PostgreSQL | 5433 |
| Redis | 6380 |
| MinIO (S3 API / Console) | 9000 / 9001 |

Ports 5433 and 6380 are intentionally non-default to avoid clashing with
existing local PostgreSQL/Redis installs (notably on Windows).

## Running the services

1. **Start infrastructure** (Postgres, Redis, MinIO):

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

2. **Configure environment:** copy `.env.example` to `.env` at the repo root and
   fill in Clerk keys and any overrides. The API loads `.env` from the monorepo
   root first, then local `.env`.

3. **Install JS/TS dependencies** (from the repo root):

   ```bash
   bun install
   ```

4. **Set up the database** (from `apps/api`):

   ```bash
   bunx prisma generate
   bunx prisma migrate deploy   # apply existing migrations (non-interactive)
   # For creating a new migration during development:
   # bunx prisma migrate dev
   ```

5. **Run the API** (from `apps/api`):

   ```bash
   bun run dev      # hot-reload dev server on :3001 (embeds a worker in dev)
   ```

6. **Run the web app** (from `apps/web`):

   ```bash
   bunx vite        # dev server on :3000
   ```

7. **Run the inference service** (from `apps/inference`):

   ```bash
   uv venv --python 3.11
   uv pip install -r requirements.txt
   uvicorn main:app --host 0.0.0.0 --port 8001
   ```

   Without a CUDA GPU, the service starts but reports SAM3 as unavailable
   (limited mode). See [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md).

On Windows, `run.bat` provides a menu that orchestrates infra, migrations, and
each service (including ffmpeg and SAM3 setup).

## Code style

- **TypeScript** (`apps/api`, `apps/web`, `packages/shared`): follow the
  existing style; run the linter and the type checker before opening a PR:

  ```bash
  bun run lint                    # whole workspace, shared eslint.config.mjs
  bunx tsc --noEmit -p apps/api
  bunx tsc --noEmit -p apps/web
  ```

  `bun run lint` must exit cleanly. Warnings are advisory (mostly unused
  imports); do not introduce new errors. Per-app runs also work:
  `cd apps/web && bun run lint`.

- **Python** (`apps/inference`): follow PEP 8, prefer type hints and Pydantic
  models for request/response shapes, keep functions small and logged.
- Keep changes focused. Match the conventions of the file you are editing.
- Do not commit secrets, large/generated binaries, model weights, datasets, or
  build output.

## Branch and PR conventions

- Branch from `main` using a descriptive name, e.g.
  `feat/export-coco-rle`, `fix/upload-thumbnail`, `docs/api-reference`.
- Keep PRs scoped to a single concern. Include a clear description of **what**
  changed and **why**, plus reproduction or testing notes.
- Reference related issues in the PR description.
- Update relevant docs (`README.md`, `structure.md`, `docs/`, `CHANGELOG.md`)
  when behavior, structure, or APIs change.
- Ensure linters pass and the affected services start before requesting review.

## Testing

A formal automated test suite is still **work in progress**. `apps/web` includes
`vitest` as a dev dependency, but coverage is minimal. Until a suite exists,
verify changes manually:

- Exercise the affected API routes (see [`docs/API.md`](./docs/API.md)).
- Run an end-to-end flow in the web app where relevant (sign in, create project,
  upload, annotate, export).

Contributions that add tests are very welcome.

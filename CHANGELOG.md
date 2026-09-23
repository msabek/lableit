# Changelog

## 1.0.0 - Public academic release (2026-09-21)

### Authentication removed (2026-09-23)
- **REMOVED**: **All authentication.** No accounts, no login, no tokens, no admin-approval gate. Lableit is released as a repository you clone and run yourself, so requiring a hosted identity provider to label images on your own machine was friction without benefit. Gone: Clerk end to end (`@clerk/backend`, `@clerk/clerk-react`, `ClerkProvider`, `ProtectedRoute`, the sign-in and sign-up routes, the "Clerk Setup Required" screen), `@fastify/jwt` and `JWT_SECRET`, the access gate and its request form, the `/admin` page and its four routes, `ADMIN_EMAIL`, the Resend notification path, and `bcrypt` with the password benchmarks that exercised a login that no longer exists.
- **CHANGED**: Every API request now resolves to one implicit local user (`local@lableit.local`, created on first use with an upsert). The existing `ownerId` filters are untouched, so all data belongs to that single row and nothing in the query layer had to be rewritten. `apps/api/src/index.ts` went from 3,189 to 2,857 lines; the web app lost four files.
- **CHANGED**: The landing page opens the app directly ("Open Lableit", "Start Labeling"), the catch-all route goes to `/projects`, and the sign-up wording is gone.
- **KEPT**: The export download token (a single-use, file-scoped capability token, not authentication), project scoping for classes and tags, the one-project rule for inference jobs, the video-slicing prefix check, the `intervalSec` validation, helmet, CORS and the rate limiter. A single user still benefits from every one of those.
- **DOCUMENTED**: `README.md` gains a "No accounts, and what that means" section and `SECURITY.md` leads with it: **anyone who can reach the app can read, change and delete everything in it**, so run it locally or behind your own VPN or authenticating proxy. `DEPLOYMENT.md` and `RAILWAY_DEPLOYMENT.md` carry the same warning, and every auth variable is gone from the env templates, `docker-compose.prod.yml` and the web Dockerfile's runtime config. `docs/API.md`, `docs/USER_GUIDE.md`, `docs/TROUBLESHOOTING.md`, `CONTRIBUTING.md`, `structure.md`, `NOTICE` and `THIRD-PARTY-LICENSES.md` updated to match.
- **VESTIGIAL**: The `users` columns `password`, `externalId`, `accessStatus`, `institution`, `phone`, `useCase`, `requestedAt` and `decidedAt` remain in the schema, commented as unused. No migration was written: an unused column is harmless, a migration on other people's databases is not.
- **VERIFIED**: The API starts with `CLERK_SECRET_KEY`, `JWT_SECRET` and `ADMIN_EMAIL` all unset, answers `GET /projects` 200 with no `Authorization` header, creates and deletes a project the same way, and returns 404 for every removed route. The web app opens straight to the projects dashboard with no sign-in. Type checks, lint (0 errors), production build, web tests 15/15 and api tests 16/16 all pass.

### License
- **CHANGED**: Relicensed from PolyForm Noncommercial + paid commercial license to the **Lableit Academic Research License 1.0** (`LICENSE`): free for academic use (teaching, learning, non-commercial research at universities and non-profit research institutes); **any other use needs prior written permission**. `LICENSE-COMMERCIAL.md` is replaced by `PERMISSIONS.md` (how to ask). Updated `NOTICE`, `THIRD-PARTY-LICENSES.md`, `CONTRIBUTING.md` (contribution terms, CLA TODO resolved), `CITATION.cff` (real repo URL, version, `license-url`), and the `license` field of every `package.json` (`SEE LICENSE IN LICENSE`).
- **FIXED**: Copyright holder name spelled "Mohamed Sabek" consistently in LICENSE, NOTICE, and third-party notices.

### Docs
- **CHANGED**: **README rewritten** as the main description of the system: new hero and positioning, a "why this exists" comparison, a picture-led walkthrough of all five workflow steps, capability tables (labeling and AI, media and datasets, platform), an access-control section, keyboard shortcuts, and refreshed setup, configuration and deployment sections. All 12 screenshots are current in-app captures (the old set predated the creation wizard, the honest landing copy and the light-theme default) and were recompressed from 3.8 MB of PNGs to 1.5 MB of JPEGs.
- **ADDED**: **CIVAD** is now spelled out wherever it appears: the **Construction Industry Vision Alberta Dataset** (over 50 classes, more than 86,905 images), with the ISARC 2025 citation (Sabek, Mei, Lee, Golabchi, Gonzalez; doi:10.22260/ISARC2025/0124). Co-authors are acknowledged by name in the README.
- **FIXED**: Second accuracy pass over the new README, against a fresh read of the code: the CUDA row claimed "bf16 autocast enabled" (it is off unless `INFERENCE_USE_AUTOCAST` is set); the macOS `run.command` note implied it starts the Docker stack (it uses native Postgres 16, Redis and a MinIO binary from `.devstack`, and says so now, with the brew packages listed); the security section said the API enforces Clerk auth without noting the four deliberately public status routes; `JWT_SECRET` is required in production only; and the env table gained `INFERENCE_USE_AUTOCAST`, `VITE_API_URL`, `PORT`/`API_HOST`, `S3_REGION`/`LOG_LEVEL`.
- **FIXED**: The export wizard's `png_masks` preview still showed "Each annotation saved as a separate PNG file ... image_001_annotation_0.png". It now shows the files that exporter really writes (`class_colors.txt` and `masks/mask_metadata.json`) and says PNGs are not generated.
- **NOTE**: The README capability list was checked line by line against the code before publishing. Claims that did not survive were removed rather than shipped: number-key class assignment, undo/redo (the buttons exist but `recordAction` is never called), canvas zoom and pan, and most of the in-app shortcut list. The README now documents only the shortcuts that are wired, and says plainly that the in-app list is broader than the implementation.
- **ADDED**: `docs/API.md` now documents the access-approval gate and the four access-control routes (`/auth/access-status`, `/access-requests`, `/admin/access-requests`, `/admin/access-requests/:userId/decision`), which were entirely missing.
- **ADDED**: README "About this project": developed by Mohamed Sabek during his research at the IHT Lab, University of Alberta; used alongside other tools to build the CIVAD dataset.
- **FIXED**: README device table now says Apple Silicon uses MPS (the GPU) by default.
- **CHANGED**: Public contact changed from a personal Gmail to **Sabek@ualberta.ca** in `PERMISSIONS.md` and `SECURITY.md` (the `SECURITY.md` contact TODO is resolved).

### Web (app screens)
- **REMOVED**: Controls that did nothing. Undo and redo (the history hook was wired to buttons and `Ctrl+Z`, but `recordAction` had zero callers, so the stacks were always empty), the filter-presets dropdown (its state was written and never read; `AssetGrid`'s own All / Labeled / Unlabeled tabs already work), and `ExportPanel.tsx` (339 unreachable lines, since `setShowExport(true)` is never called). Net 945 lines deleted, 76 added.
- **FIXED**: `Escape` inside the export wizard, the video-slice dialog or a confirmation modal navigated out of the project entirely. It is now a no-op while a modal is open; with nothing open it still goes back to Projects. Five cases verified in the browser.
- **CHANGED**: `structure.md` now points at `ExportWizard.tsx` (the reachable export dialog) instead of the deleted `ExportPanel.tsx`, and the README shortcut section says the in-app list now matches the implementation.
- **FIXED**: The in-app shortcut list advertised 18 shortcuts when about 6 worked. It now lists only the working ones, with the two wrong entries corrected (`Ctrl+P` is really `Ctrl+Shift+P`; `Del` deletes the selected **annotation**, not the asset), and the sidebar "Shortcuts" button, which had no click handler, now opens it.
- **FIXED**: Dragging or resizing a box fired one API write per `mousemove`. Measured: 30 mouse-moves produced **30 requests, of which only about 3 were actually applied** because each awaited its own response and dropped the rest. The canvas now keeps the drag local and saves once on mouse-up (plus on mouse-leave, so a drag ending outside the canvas is not lost): **1 request, and the full travel persisted**.
- **FIXED**: The "Multi-Layer Annotations" feature card claimed users can "create bounding boxes, segmentation masks, and polygon annotations". There is no polygon tool: SAM3 returns masks, and manual drawing is boxes only. The card now says that.
- **FIXED**: The export dialog advertised `png_masks` as "PNG mask images with class-specific coloring" and offered a `.png` extension, but that exporter writes a per-class colour map and mask metadata JSON, no PNG files. The description now says what it actually produces.
- **FIXED**: The export dialog's "Include images" checkbox did nothing: the wizard never sent it and the exporter always bundles the images. It is now a plain statement that images are included, instead of a control that pretends to be a choice.
- **FIXED**: The theme menu in the floating dock (bottom-right; the dock is hidden on `/projects` and `/labeling/*`, so this affects `/admin` and other pages that show it) always opened downwards, so at 1440x900 the whole Light / Dark / System panel rendered below the viewport and was unreachable. It now flips upwards when there is less than ~230 px below. Measured after the fix: button bottom 880, panel top 638 / bottom 834, fully on screen; the header version on `/projects` still opens downwards.
- **FIXED**: The finished-export screen said "Step 4 of 3" in the wizard header; it now says "Done".

### Web (landing page)
- **CHANGED**: The **light theme is now the default** (`DEFAULT_SETTINGS.theme` is `light`, was `system`), so a visitor on a dark-mode device lands on the light UI. The Light / Dark / System toggle is unchanged. A one-time migration (`lableit_theme_default_v2`) moves existing browsers that still carry the old `system` default to light; an explicit `dark` or `system` choice made after that is kept. The migration runs at module load, not in the `useState` initializer, which React StrictMode calls twice.
- **CHANGED**: The landing attribution row now shows the **IHT Lab** wordmark (linking to iht-lab.com) instead of the University of Alberta logo, with the department named in text. Uses a locally drawn SVG so no third-party logo artwork is redistributed.
- **FIXED**: Removed made-up marketing claims ("200+ Enterprise Teams", "50K+ images labeled daily", "99.5% accuracy", "15+ countries", "Free tier with 100 images/month", "Enterprise Ready", "10x faster") and replaced them with true facts (8 export formats, SAM3 text prompts, images + video, free for academic use). Footer GitHub link now points to the real repo; placeholder Twitter link replaced with a License link; credit wording aligned to "Dr. Mohamed Sabek".
- **FIXED**: Use-case cards and feature stats no longer promise things the app does not do ("99% accuracy", "10x faster", "HIPAA compatible", "DICOM", "KITTI", "GeoTIFF", "QGIS export", "motion tracking", "facial recognition", "edge deployment"); they now list real capabilities. "8+ formats" is now "8 formats" everywhere.
- **FIXED**: The landing "Try it" section drew random boxes while claiming to run SAM3. It is now labelled an **Interface Preview** that draws example boxes at random; the broken sample-image buttons ("would be loaded here in production") were removed.
- **FIXED**: 4 TypeScript errors (`labeling.tsx`, `ExportWizard.tsx`, `useAssetAnnotation.ts`); `tsc --noEmit` is now clean for web and api.

### API / security
- **REMOVED (privilege escalation):** `POST /auth/register` and `POST /auth/login`. Both were in the unauthenticated public-route allowlist, neither was called by the web app (sign-in is Clerk only), and registration accepted **any** email address. Since admin was resolved by comparing the stored email to `ADMIN_EMAIL`, a stranger could register that address and be treated as the admin: read every applicant's email, institution, phone and stated use, and approve or deny anyone. It worked even when the real admin already existed, because the unique index on `users.email` is case sensitive while the admin comparison lowercases both sides, so one capital letter created a second row that still matched. The rogue row could not even be denied through `/admin`, because the "cannot deny the admin account" guard protected it too. Both routes are gone, along with the dead `auth.login` / `auth.register` helpers in the web client and the now-unused bcrypt import.
- **FIXED (defence in depth):** admin now also requires the account to be linked to a Clerk identity (`externalId`), not just to carry the matching email, so an account created by any other route can never claim it.
- **FIXED (filtergraph injection):** `intervalSec` on `POST /projects/:projectId/slice-video` was typed as a number but never checked at runtime, and it is interpolated into the ffmpeg filtergraph the worker executes (`fps=1/<value>`). A string such as `1,drawtext=textfile=/app/apps/api/.env:...` appended filters of the caller's choosing; because every extracted frame is uploaded into the caller's own project, whatever those filters rendered came back as a viewable image. Adding ffmpeg to the API image in this same release is what would have made it reachable in production. Now validated at the route (finite number, greater than 0, at most 3600, else 400) and re-coerced in the worker so an older queued job cannot reintroduce it.
- **FIXED (authorization):** five places where owning one resource let a request reach another project's, or another account's, data. Each was confirmed with a real request against a running stack, then re-tested after the fix (evidence in `.evidence/2026-09-23/api-security/`, probe script included).
  - `POST /assets/:assetId/annotations` and `PUT /annotations/:id` checked asset ownership but never that `classId` lived in that asset's project, so a caller could attach another user's class to their own annotation. Both now validate through one `classesBelongToProjects()` helper (400 on mismatch).
  - `POST /upload` applied `tagIds` from the query string unchecked, writing cross-project tag rows. Now validated with `tagsBelongToProject()` **before** the file is read, so a rejected request cannot leave an orphaned asset and S3 object behind.
  - `POST /projects/:projectId/slice-video` accepted any `videoUri`, and the worker downloads that key from S3 **and deletes it** when slicing finishes. Three escapes were confirmed (another user's prefix, a `..` traversal, a key outside `projects/` entirely). The URI is now constrained to the job's own `projects/<projectId>/` prefix, with a `..` segment check; `tagIds` validated the same way.
  - `POST /jobs/preview` and `POST /jobs/batch` never validated `classes[].id`, and the worker writes the matched class id straight into `annotation.classId`. `validateAssetOwnership()` became `validateJobTargets()` and now checks class ids against the assets' project. It also requires every asset in one job to belong to one project, so a mixed batch cannot smuggle a second project's class in.
  - `POST /access-requests` let a **denied** account reset itself back to `pending`, undoing the admin's decision indefinitely. Denied accounts now get 403; pending accounts can still update their request, and an admin can still approve a denied account afterwards.
- **CHANGED**: `ADMIN_EMAIL` has **no default** any more (it used to fall back to the maintainer's personal address, so a fork deployed without it would have made that address its admin). If unset, the API warns at startup, nobody is admin, and no request emails are sent. All admin checks go through one `isAdminEmail()` guard so an empty value can never match an account with no email.
- **FIXED**: Renaming a project to a blank name was accepted (200). Create and rename now share one `projectNameError()` check (400 on blank / >100 chars) and names are trimmed.

### Tooling
- **FIXED**: `bun run lint` works again. Single flat `eslint.config.mjs` at the repo root (ESLint 9 + typescript-eslint installed once at the root, the web app's own ESLint 8 removed); per-app scripts dropped the removed `--ext` flag, and the root script lints `apps packages` directly, so it no longer crashes on `packages/shared` (which has no lint script). Rules are advisory: 0 errors, 55 warnings (mostly unused imports), no application code rewritten. This supersedes the 0.4.7 note about `bun run --workspaces lint`.
- **FIXED**: `apps/api/src/tests/benchmarks.test.ts` crashed on import without a database (`new PrismaClient()` at module load), so `bun test` showed 7 failures on a fresh clone. The Prisma client and the 7 database tests are now guarded by `DATABASE_URL`: 11 pass / 7 skip / exit 0 without a database, 18 pass with one. Assertions unchanged.
- **FIXED**: `run.command` starts inference with `.venv/bin/python -m uvicorn` (the venv's `uvicorn` launcher hardcodes the folder the venv was created in, so it broke after the project moved) and sets `LC_ALL` so Postgres starts.
- **FIXED**: `.gitignore` now ignores `.devstack` and `apps/inference/models` when they are symlinks; `.evidence/` (local test screenshots) is ignored.

### Deployment
- **FIXED**: The API Docker image had no **ffmpeg**, which the API shells out to for video frame extraction, so every `slice_video` job would have failed on any Docker or Railway deployment (`apps/inference` had it, `apps/api` did not). Added to `apps/api/Dockerfile`.
- **FIXED**: In `docker-compose.prod.yml` the api and worker containers did not share the exports directory, and exports are written to local disk by whichever process runs the job (the worker) then served over HTTP by the api. Every export download would have 404'd. Both services now mount a shared `exports_data` volume at `/app/apps/api/exports`.
- **FIXED**: Pascal VOC exports wrote `<folder>images</folder>` while the exporter creates `JPEGImages/`. The XML now matches the directory.
- **FIXED**: Deployment templates and guides updated for production (see `DEPLOYMENT.md`, `RAILWAY_DEPLOYMENT.md`, `docker-compose.prod.yml`, env templates): access-control variables, Railway build context (repo root + Dockerfile path), API runs `/start.sh` so migrations apply, worker start command fixed (`bun --cwd apps/api run start`; the old root `bun run start` did not exist) and marked required, web container gets the Clerk key and API URL, S3 credentials required (no `minioadmin` fallback), bucket no longer public, `S3_ENDPOINT` overridable, `HF_TOKEN` passed to inference, Clerk production setup documented.

### Verification (2026-09-21)
- **Automated:** `tsc --noEmit` clean for `apps/api`, `apps/web`, `packages/shared`; `bun run lint` 0 errors (55 advisory warnings); web tests 15/15; `bun test` in `apps/api` 11 pass / 7 skip without a database, 18 pass with one; `vite build` succeeds; Python sources compile; Prisma schema matches the migrations; `docker compose -f docker-compose.prod.yml config` validates.
- **End-to-end (through the API, on Apple Silicon):** access gate blocks an unapproved account and accepts a request; admin approves and a non-admin gets 403; project creation, image upload, SAM3 text-prompt detection (1 car + 4 wheels in 22.5 s on MPS), COCO / YOLO-detect / YOLO-segment exports containing real annotations, one-shot export download tokens, class deletion cascading to annotations, project rename, and video slicing into frames.
- **In the browser, signed out:** landing page (hero, features, use cases, interface preview, CTA/footer), sign-in page, and the light-theme default (new visitor, returning visitor, explicit dark choice).
- **In the browser, signed in:** the signed-in screens were walked through with a throwaway Clerk test user (created through the Clerk Backend API with a sign-in token, then deleted): access-request gate, `/admin` with pending requests, projects dashboard, the creation wizard (upload + classes), the labeling workspace, a real SAM3 detection (1 car, 4 wheels, 6 windows in 68 s on MPS), the export dialog with all 8 formats, a completed export, and the theme menu. This walkthrough is what surfaced the two app-screen bugs above.
- **Not legal advice:** the license text in `LICENSE` has not been reviewed by a lawyer, and university IP policy may apply to work done during research at the University of Alberta. Review both before relying on the license.

## Unreleased - GPU auto-detect, creation wizard, delete fix (Jun 2026)

### Inference
- **CHANGED**: Device auto-selection now prefers the **Apple Silicon GPU (MPS)** when no CUDA is present (`cuda → mps → cpu`), so Macs use the Metal GPU automatically instead of defaulting to CPU. Verified with a real SAM3 detection on MPS (returns boxes, no errors). Override with `LABLEIT_DEVICE=cpu`. A few SAM3 ops still fall back to CPU via `PYTORCH_ENABLE_MPS_FALLBACK=1`, so MPS is not always faster than CPU for SAM3.

### Access control
- **ADDED**: Admin-approval gate for new accounts. After Clerk sign-in, an unapproved account sees an **access-request form** (name + email prefilled, institution / phone / intended-use) instead of the app; submitting emails the admin via **Resend** and stores the request. The API blocks all app routes for unapproved accounts (allowlist gate → 403 `pending_approval`), so it can't be bypassed by calling the API directly.
- **ADDED**: In-app **admin page** (`/admin`, admin-only) to approve/deny requests, plus a shield link in the projects header for the admin. Admin is `ADMIN_EMAIL` (default `appegy1@gmail.com`), resolved to the real verified email via the Clerk API and always auto-approved. Resend is optional — without `RESEND_API_KEY`, requests still appear on `/admin` (email skipped, reported honestly). New `users` columns: `accessStatus`, `institution`, `phone`, `useCase`, `requestedAt`, `decidedAt` (existing accounts grandfathered to `approved`).

### Web
- **ADDED**: Step-by-step **project creation wizard** (`ProjectCreateWizard`) replacing the name-only dialog — 1) name + upload images/videos (reuses video slicing), 2) add classes, 3) review + Start labeling. Lists are scroll-capped.
- **ADDED**: Global attribution footer (`Credit` component) — "Developed by Dr. Mohamed Sabek at the IHT Lab, University of Alberta" — shown at the bottom of every app page (projects, labeling, auth); the landing page keeps its existing richer credit footer.
- **REMOVED**: "Smart Auto-Labeling" button and its entire `/build` workflow (`BuildFlow` component, the `/build/:projectId` route, and the `BuildFlowWrapper`). Superseded by the step-by-step creation wizard + per-project labeling flow.
- **FIXED**: Theme color "hue" washing over / obscuring UI. The `.bg-mesh-gradient` decorative tint layers (`::before`/`::after`) were `position:absolute` with no `z-index`, so they painted **on top of** non-`z-indexed` page content (e.g. the labeling screen) as a colored film. Gave the container its own stacking context (`isolation:isolate; z-index:0`) and moved the tint layers to `z-index:-1` so they always sit behind content; softened the corner glow (opacity 0.5, smaller radii) and the dark-mode ambient mesh for better contrast in both light and dark.
- **FIXED**: Deleting projects/classes/tags/assets and renaming a project failed in the browser with a generic **"Network Error"**. The API CORS preflight only advertised `GET,HEAD,POST`, so browsers blocked `DELETE`/`PUT`/`PATCH` before the request reached the server. Added an explicit `methods` allowlist (`GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS`).

### Tooling
- **ADDED**: `run.command` — double-click macOS launcher that starts local infra (Postgres/Redis/MinIO) + API/inference/web, waits for readiness, opens the app, and stops everything on Ctrl+C.

## Unreleased - Apple Silicon / macOS Support (Jun 2026)

### Cross-platform inference (Windows behavior unchanged)
- **ADDED**: SAM3 inference now runs on **Apple Silicon Macs** (and CPU-only Linux), not just NVIDIA CUDA. Verified end-to-end on Apple Silicon: model loads, text-prompt detection runs (~6 s/image on CPU), annotations render on the canvas, and exports work.
- **ADDED**: Device auto-selection with an explicit `LABLEIT_DEVICE=cuda|mps|cpu` override. (Apple Silicon originally defaulted to CPU; this was later changed to prefer the MPS GPU — see the top section.)
- **ADDED**: `apps/inference/_compat/torch_device_compat.py` — runtime shim that redirects SAM3's hardcoded CUDA usage (`.cuda()`, `device="cuda"`, `torch.autocast("cuda")`, `pin_memory()`) to the active device and forces a single float32 dtype. No-op on CUDA, so Windows/Linux GPU hosts are unaffected.
- **ADDED**: `apps/inference/_compat/patch_sam3_triton.py` — makes SAM3's hard `import triton` (which has no macOS build) optional. Idempotent; no-op when real triton is present.
- **ADDED**: `apps/inference/setup_mac.sh` — one-command macOS/Apple-Silicon setup (venv, torch, deps, SAM3 `--no-deps`, triton patch).
- **CHANGED**: `requirements.txt` now declares SAM3's transitive deps (iopath, timm, ftfy, regex, psutil) since SAM3 is installed with `--no-deps`, and gates `decord` to non-macOS (no Apple-Silicon wheel; not needed for image inference). Re-added `psutil` (SAM3 requires it). The `sam3` git line is installed separately by the launchers to avoid a numpy resolver conflict.
- **ADDED**: README "Devices" section + per-platform Quickstart; live app screenshots captured on Apple Silicon (projects, SAM3 detection on canvas, export).

## Unreleased - Public Release Preparation (Jun 2026)

### Licensing
- **CHANGED**: Relicensed from MIT to **PolyForm Noncommercial License 1.0.0** (© Mohamed Sabek) with a separate paid **commercial license** (`LICENSE-COMMERCIAL.md`). Free for research/education/personal use; commercial use requires a license.
- **ADDED**: `NOTICE`, `THIRD-PARTY-LICENSES.md`, and `CITATION.cff`. Documented that SAM3 weights **and** the `sam3` package are governed by Meta's separate SAM License and are not redistributed by Lableit.

### Security
- **FIXED**: IDOR on `GET /jobs/:id` and `POST /jobs/preview|batch` — added ownership checks; the worker now scopes asset queries to the requesting owner.
- **FIXED**: Removed the hardcoded weak dev JWT fallback secret; `JWT_SECRET` is now required (fail-fast in production).
- **ADDED**: `@fastify/helmet` security headers; rate limiter now keys on `request.ip` with `trustProxy` instead of a spoofable header.
- **CHANGED**: Inference service CORS is now an allowlist (`INFERENCE_ALLOWED_ORIGINS`, `allow_credentials=false`) with an optional shared secret (`INFERENCE_SHARED_SECRET`); documented that it must run on a private network. Added input validation to `/infer/upload`.
- **REMOVED**: Real secrets and PII purged from the tree (live build bundle, Windows `model_config.json` with an absolute user path); secret scrub + hardened `.gitignore`/`.dockerignore`.

### Performance (workflow-preserving)
- **IMPROVED**: API signed-URL endpoints drop the per-asset S3 HeadObject probe and parallelize in chunks; job-progress polling is now O(1) (BullMQ job id = DB job id); project/asset list queries omit heavy geometry; video-slice loop runs bounded-concurrency with batched inserts; export JSON no longer pretty-printed.
- **IMPROVED**: Web bundle is route-split (`React.lazy`) with vendor `manualChunks` (clerk/gsap/react/router/axios/icons) so the landing page no longer ships the full app; asset grid batches thumbnail URL fetches.
- **IMPROVED**: Inference reuses an HTTP keep-alive session, optionally downscales oversized images (honoring `max_image_size`) and supports optional bf16 autocast (off by default).

### Build & Deploy
- **FIXED**: Docker build chain made reproducible — API/web Dockerfiles install the full Bun workspace and run `prisma migrate deploy` on startup; inference Dockerfile installs PyTorch and ships `download_models.py` + `assets/`; added root `.dockerignore`.
- **ADDED**: Initial Prisma migration (`prisma/migrations`) — previously missing despite docs claiming auto-migrate.
- **ADDED**: `docs/USER_GUIDE.md`, `docs/API.md`, `docs/EXPORT_FORMATS.md`, `docs/TROUBLESHOOTING.md`, `CONTRIBUTING.md`, `SECURITY.md`; rewrote the README for cross-platform setup; reconciled ports, Python version (3.11), and `docker compose` usage.

### Branding
- **ADDED**: Animated SVG logo (`assets/logo.svg` banner + `assets/logo-mark.svg` icon) that animates in the README; wired as the app favicon.
- **FIXED**: Brand wordmark typo in the `Logo` component — rendered "Labelit" instead of "Lableit".
- **ADDED**: README logo banner, license/runtime badges, and a Screenshots section (landing-page captures).

### Cleanup
- **REMOVED**: Stray files (`0.1.2`, `.DS_Store`, duplicate `package-lock.json`), stale build output, dev cruft (`debug_load.py`, `__pycache__`), ~1,500 lines of unused web components, and unused Python deps (`sse-starlette`, `psutil`).

## Unreleased - Security and Throughput Hardening

### Security
- **UPDATED**: Production npm audit is clean after upgrading Clerk, Fastify, Fastify JWT, Axios, BullMQ, bcrypt, Vite, and related transitive packages.
- **UPDATED**: API storage integration migrated from AWS SDK v2 to modular AWS SDK v3 packages.
- **UPDATED**: Python inference dependencies are pinned, including SAM3 pinned to commit `c97c893969003d3e6803fd5d679f21e515aef5ce`.

### Runtime & Performance
- **FIXED**: Production API and worker roles are now separated. `WORKER_MODE=true` starts the BullMQ worker without an HTTP listener; production API no longer embeds a worker by default.
- **FIXED**: Batch inference now uses the shared retry/timeout proxy logic with `INFERENCE_BATCH_TIMEOUT_MS`.
- **IMPROVED**: SAM3 model loads in eval mode and inference functions run under `torch.inference_mode()`.
- **IMPROVED**: Asset grid renders and prefetches one page at a time to avoid large signed-URL bursts and oversized React trees.
- **IMPROVED**: Export ZIP creation now uses an in-process zip library instead of shell commands.

## 0.4.11 - Railway Connectivity Stabilization (Feb 15, 2026)

### Deployment & Runtime Config
- **FIXED**: Web frontend no longer falls back to `localhost:3001` in production when `VITE_API_URL` is missing at build time.
- **FIXED**: Web runtime config now includes `VITE_API_URL` (in addition to Clerk key), enabling API endpoint control without code rebuilds.
- **FIXED**: API and worker `INFERENCE_URL` corrected to `http://inference.railway.internal:8080` to match Railway runtime port.
- **FIXED**: Web `API_URL` (nginx upstream) corrected to `http://api.railway.internal:8080` to match API runtime port.

### Verification
- **VERIFIED**: API health endpoint responds with `database: connected`.
- **VERIFIED**: API inference model-status endpoint returns valid JSON and reflects CPU-only limited mode.

## 0.4.10 - Railway Clerk Runtime Fix (Feb 14, 2026)

### Deployment & Runtime Config
- **FIXED**: Web Railway startup now generates `/runtime-config.js` and injects it into `index.html` before Nginx starts, ensuring the Clerk publishable key is available at runtime.
- **FIXED**: Frontend Clerk bootstrap now reads runtime config from `window.__LABLEIT_CONFIG__` (with build-time env fallback), preventing Vite build-time constant folding from forcing the setup screen in production.
- **VERIFIED**: Public web URL now renders the live app UI instead of the "Clerk Setup Required" fallback page.

## 0.4.9 - Railway URL Access Stabilization (Feb 14, 2026)

### Deployment & Runtime Config
- **FIXED**: Web service now injects runtime config (`runtime-config.js`) at container start so `VITE_CLERK_PUBLISHABLE_KEY` can be read reliably on Railway deployments.
- **FIXED**: Web service startup command is explicitly set in Railway config to ensure Nginx boots through `/start.sh`.
- **UPDATED**: Railway service URL variables now use concrete internal service URLs (`api.railway.internal:3001`, `inference.railway.internal:8001`) to avoid malformed host strings.

## 0.4.8 - Railway Build Context Fix (Feb 14, 2026)

### Deployment & Infrastructure
- **FIXED**: API, web, and inference Dockerfiles now support app-local build contexts (`apps/api`, `apps/web`, `apps/inference`) used by Railway CLI service deployments.
- **FIXED**: Service `railway.toml` files now reference local `Dockerfile` paths, removing monorepo-root path dependency during deploy.
- **FIXED**: Inference Dockerfile copy paths now match app-local context.

## 0.4.7 - Railway Deployment Hardening (Feb 14, 2026)

### Deployment & Infrastructure
- **FIXED**: API now validates critical runtime environment variables in production and fails fast on missing config (`DATABASE_URL`, `REDIS_URL`, `INFERENCE_URL`, `S3_*`).
- **FIXED**: API Docker startup now runs `prisma migrate deploy` before launching the server to reduce schema drift at first boot on Railway.
- **FIXED**: Web Docker image now uses the Railway nginx template and runtime `envsubst` for both `PORT` and `API_URL`.
- **FIXED**: Inference Docker image now installs Python dependencies with `uv` (system install) and includes `git` for Git-based dependencies.

### Tooling
- **FIXED**: Root lint command updated to a workspace-compatible Bun command (`bun run --workspaces lint`). *(Superseded in 1.0.0: that command crashed on `packages/shared`, and neither app had an ESLint config. See the 1.0.0 Tooling section.)*

## 0.4.6 - SAM3 Resilience + UAlberta Landing Attribution (Feb 8, 2026)

### Bug Fixes
- **FIXED**: Inference model path drift across cloned/versioned folders (e.g., `v4.6` -> `v4.8`) caused checkpoint lookup failures and HuggingFace 401 fallback loops.
- **FIXED**: Repeated SAM3 load attempts on every inference request after a failed load, which flooded logs and external model endpoints.
- **FIXED**: Batch auto-annotation continued processing all assets even after fatal model-unavailable errors.

### Inference & Launcher Improvements
- **NEW**: Inference service now auto-repairs stale absolute paths in `apps/inference/model_config.json` when paths point to older workspace folders.
- **NEW**: Model load retry cooldown added (`MODEL_LOAD_RETRY_COOLDOWN_SECONDS`, default `120`) to prevent rapid repeated failed loads.
- **NEW**: Manual `POST /models/sam3/load` now forces a retry even during cooldown windows.
- **NEW**: `run.bat` now proactively repairs stale `model_config.json` paths before SAM3 startup checks.
- **IMPROVED**: API batch inference now fails fast when SAM3 is unavailable (stops cascading per-asset 503 retries).

### Landing Page / Branding
- **UPDATED**: Replaced placeholder “trusted by companies” row with University of Alberta branding and trust copy.
- **UPDATED**: Added explicit attribution across landing sections:
  - Created by **PhD Mohamed Sabek**
  - **IHT Lab**, Department of Civil and Environmental Engineering
  - **University of Alberta, Edmonton, Canada**
- **UPDATED**: Landing now uses University of Alberta logo asset sourced from UAlberta web assets.

## 0.4.5 - UX Polish, Theme Expansion, and Data Accuracy Fixes (Feb 8, 2026)

### Bug Fixes
- **FIXED**: SAM3 GPU support could regress after SAM3 reinstall. Launcher/install flow now avoids overwriting CUDA-enabled torch wheels during SAM3 setup.
- **FIXED**: Asset preview switching race condition in labeling modal could show stale/missing image while detections updated.
- **FIXED**: Preview modal flicker during asset navigation by keeping modal mounted and showing scoped loading states.
- **FIXED**: Project/asset counters showing `0` when backend returned `_count.assets` instead of full `assets` arrays.
- **FIXED**: Labeling layout top-left empty sidebar corner by aligning sidebar to full viewport height (`top-0`, `h-screen`).

### UI/UX Improvements
- **NEW**: Preview experience moved into a modal workflow with previous/next navigation controls and keyboard support.
- **NEW**: Clicking the Lableit logo in dashboard and labeling now returns users to homepage/projects.
- **IMPROVED**: Projects dashboard visual redesign with stronger glassmorphism hierarchy and updated stat card styling.
- **NEW**: Expanded global theme system with color palettes (`indigo`, `ocean`, `sunset`, `forest`) in addition to mode (`light`, `dark`, `system`).
- **IMPROVED**: Theme controls are available broadly across authenticated pages for consistent cross-page styling.

### Technical Changes
- Added request-id guards in annotation loading to ignore stale async responses.
- Reset image element state correctly on asset URL changes to prevent old image lifecycle callbacks from leaking into new asset render.
- Normalized project payloads in web API client to expose consistent `assetCount` from either `assets.length` or `_count.assets`.
- Added reusable `getProjectAssetCount()` helper and migrated project/stat displays to use it.
- Updated sidebar component API to support configurable logo click handlers.

## 0.4.4 - CUDA & SAM3 Compatibility Fix (Feb 7, 2026)

### Bug Fixes
- **FIXED**: SAM3 "library not found" - PyPI `sam3==0.1.2` has broken package structure (missing `sam3.sam` submodule). Now installs from GitHub repo instead ([Issue #225](https://github.com/facebookresearch/sam3/issues/225))
- **FIXED**: PyTorch CUDA installs as CPU-only on RTX 5070 Ti - `uv pip install --index-url` resolved wrong wheel. Now uses `--torch-backend=cu128` for reliable CUDA wheel resolution
- **FIXED**: SAM3 missing Windows dependencies (`triton-windows`, `einops`, `decord`) now auto-installed
- **FIXED**: SAM3 force-reinstall ordering - was reinstalling before CUDA verification/nightly fallback, now reinstalls after final torch is in place
- **FIXED**: uvicorn WatchFiles reloading `.venv/` during CUDA init - nested batch quotes broke `--reload-exclude` inside `cmd /c`
- **FIXED**: Port conflict (EADDRINUSE) on startup - added per-port cleanup via `netstat`+`taskkill` for ports 3000, 3001, 8001
- **FIXED**: CUDA verification now shows `torch.cuda.get_arch_list()` to confirm sm_120 Blackwell support

### Infrastructure
- PyTorch install uses `uv --torch-backend=cu128` (native resolver) with `--index-url` and nightly fallbacks
- SAM3 installed from `git+https://github.com/facebookresearch/sam3.git` in all paths (option 1, option G, requirements.txt)
- Updated `requirements.txt` with GitHub SAM3 source and missing deps

## 0.4.3 - Full System Audit & Bug Fixes (Feb 7, 2026)

### Bug Fixes
- **FIXED**: Class deletion now uses `ConfirmationModal` instead of `window.confirm` for consistent UX
- **FIXED**: Export download URL normalization prevents double-slash in URL construction
- **FIXED**: Export service S3 client deduplicated - shared from main API via `setS3Client()`
- **FIXED**: S3 image downloads during export now run in parallel (10 concurrent) instead of sequentially
- **FIXED**: Export tokens moved from in-memory Map to Redis with TTL (persists across restarts)
- **FIXED**: URL cache cleanup timer added to prevent unbounded memory growth
- **FIXED**: Client-side file size validation (500MB limit) before upload starts
- **FIXED**: `ExportWizard` now uses actual labeled asset count instead of rough estimate
- **FIXED**: Annotation list in preview section now uses theme-aware CSS variables (dark mode compatible)
- **FIXED**: Keyboard shortcut changed from `Ctrl+P` to `Ctrl+Shift+P` to avoid browser print conflict
- **FIXED**: Annotation list uses `ann.id` as React key instead of array index
- **FIXED**: `Tag`/`TagIcon` import conflict resolved in labeling.tsx
- **FIXED**: Removed `console.log` debug statements from production code (api.ts, labeling.tsx)
- **FIXED**: Removed legacy `datasets` API dead code from api.ts

### Performance
- Export image downloads now 10x faster (parallel with concurrency limit)
- Project listing uses `_count` instead of loading all assets (faster for large projects)
- Inference annotations use `createMany` batch insert instead of individual creates
- URL cache auto-cleanup prevents memory leaks in long-running sessions

### Code Quality
- `handleBatchInference` simplified from async wrapper to direct alias
- Export tokens are now single-use (consumed on download)

## 0.4.2 - Bug Fixes (Jan 22, 2026)

### Bug Fixes
- **FIXED**: Duplicate identifier error in `labeling.tsx` where `Tag` was imported from both `./api` (type) and `lucide-react` (icon component)
  - Renamed lucide-react import to `Tag as TagIcon` to resolve naming conflict
  - Updated icon usage in sidebar navigation

## 0.4.1 - Asset Tagging System (Jan 17, 2026)

### New Features
- **NEW**: Complete tagging system for organizing and categorizing assets
  - Create, edit, and delete tags with custom colors
  - Tag assets individually or in bulk
  - Tags displayed on asset thumbnails in the grid
  - Filter and search assets by tags
- **NEW**: Tag selection during import
  - Apply tags to images when uploading files
  - Apply tags to video frames during extraction
  - TagManager dropdown in the upload section
- **NEW**: TagManager component
  - Compact dropdown mode for toolbar integration
  - Full panel mode for dedicated tag management
  - Color picker with predefined color palette
  - Quick tag creation with Enter key
- **NEW**: TagBadge component for displaying tags on assets
  - Shows up to 3 tags with "+N" indicator for overflow
  - Color-coded badges matching tag colors

### Database Changes
- **NEW**: `Tag` model for project-level tags
  - Fields: id, projectId, name, color, createdAt
  - Unique constraint on (projectId, name)
- **NEW**: `AssetTag` junction table for many-to-many relationship
  - Links assets to tags with unique constraint
  - Cascade deletes when asset or tag is removed

### API Changes
- **NEW**: Tag CRUD endpoints
  - `GET /projects/:projectId/tags` - List all tags
  - `POST /projects/:projectId/tags` - Create a tag
  - `PUT /tags/:id` - Update tag name/color
  - `DELETE /tags/:id` - Delete a tag
- **NEW**: Asset-tag relationship endpoints
  - `POST /assets/:assetId/tags` - Add tag to asset
  - `DELETE /assets/:assetId/tags/:tagId` - Remove tag from asset
  - `POST /assets/bulk/tags` - Bulk add tags to multiple assets
  - `DELETE /assets/bulk/tags` - Bulk remove tags from assets
- **IMPROVED**: Upload endpoint now accepts `tagIds` query parameter
- **IMPROVED**: Slice video endpoint now accepts `tagIds` in body
- **IMPROVED**: Asset listing now includes tags in response

### UI Improvements
- **IMPROVED**: Logo component added to sidebar navigation
- **IMPROVED**: Asset grid displays tag badges on thumbnails
- **IMPROVED**: Upload section includes tag selection dropdown

## 0.4.0 - Landing Page Redesign & Interactive Demo (Jan 16, 2026)

### Landing Page Overhaul
- **NEW**: Complete landing page redesign with lighter, more professional color palette
  - Shifted from dark theme to light-first design with dark mode support
  - Slate-based neutral colors with indigo/purple gradient accents
  - Refined glassmorphism effects for modern, clean appearance
- **NEW**: Professional SVG logo with animated variant
  - Modern abstract label/tag design with gradient colors
  - Animated pulsing effect on logo elements
  - Multiple size variants (sm, md, lg, xl)
- **NEW**: Interactive TryDemoSection - test the system without signing up
  - Drag-and-drop image upload with validation
  - 12 predefined object classes with color-coded chips
  - Simulated detection overlay with bounding boxes
  - Zoom controls for image inspection
  - Results summary with detection counts per class
  - CTA to sign up after trying the demo
- **NEW**: Comprehensive HowItWorksSection
  - 4-step workflow explanation with icons and features
  - Connection line visualization between steps
  - Upload → Define Classes → AI Detection → Export flow
- **NEW**: UseCasesSection with 8 industry applications
  - Autonomous Vehicles, Medical Imaging, Quality Control, Retail
  - Security & Surveillance, Aerospace & Drones, Scientific Research, Geospatial
  - Interactive tabbed interface with detailed descriptions
  - Industry-specific stats and features
- **IMPROVED**: Enhanced HeroSection
  - SAM3 badge with animated sparkle
  - Key benefits (Free to start, No credit card, GPU-accelerated)
  - 6 feature pills grid
  - Social proof placeholder section
  - Scroll indicator animation
- **IMPROVED**: FeaturesSection with stats row
  - 6 feature cards with color-coded icons
  - Stats row showing 10x faster, 8+ formats, 99% accuracy
- **IMPROVED**: CTASection with lighter styling
  - Benefits list with check icons
  - Social links in footer with heart icon
  - Updated copyright and team attribution
- **IMPROVED**: ExportShowcase with lighter styling
  - Updated color classes for light/dark mode
  - Additional info row (One-Click Export, Metadata Preserved, ML-Ready Output)

### CSS Updates
- **NEW**: Lighter color palette CSS variables
  - `--color-background: #f8fafc` (light), `#0f172a` (dark)
  - `--color-text: #1e293b` (light), `#f8fafc` (dark)
  - Updated gradient definitions for softer appearance
- **NEW**: Typography utility classes
  - `.heading-xl`, `.heading-lg`, `.body-lg` for consistent typography
- **NEW**: Demo-specific styles
  - `.demo-dropzone` with dashed border and drag-active state
  - `.class-chip` for selectable class buttons
  - `.detection-box` with animation keyframes

### Navigation Updates
- Updated nav links: Features, How It Works, Try Demo, Use Cases, Exports
- Integrated Logo component in navigation bar
- Scroll progress indicator with section labels

## 0.3.8 - Dependency Fixes & Export Functionality (Jan 13, 2026)

### Bug Fixes
- **FIXED**: `[plugin:vite:react-babel] _lruCache is not a constructor` error
  - Removed problematic `@babel/helper-compilation-targets` version override from root package.json
  - Updated `@vitejs/plugin-react` from `^4.3.4` to `^4.3.6` for better compatibility
  - Updated `vite` from `^5.4.10` to `^5.4.21` for latest bug fixes
  - Performed clean reinstall of all dependencies to resolve version conflicts
  - This resolves the Vite dev server startup error that was preventing the web app from running

- **FIXED**: Export functionality not working (400 error and page refresh)
  - Fixed type mismatch in `ExportWizard.tsx` - now uses correct `ExportFormat` type from API
  - Updated `ExportWizard` to fetch formats from API instead of using hardcoded outdated formats
  - Fixed download URL to use `downloadPath` from API result instead of constructing incorrect URL
  - Added better validation and error messages to export API endpoint
  - Fixed authentication middleware to allow normal auth for `/exports/:jobId/status` endpoint (was requiring export tokens)
  - Fixed route matching in middleware to properly detect status endpoints vs file downloads
  - Prevented automatic redirect to auth page on export-related 401 errors (caused page refresh)
  - Added user ownership verification for export job status checks
  - Export wizard now displays all supported formats: `coco`, `yolo_detect`, `yolo_segment`, `voc`, `png_masks`, `createml`, `tfrecord_meta`, `labelme`

### Technical Changes
- Removed `overrides` field from root `package.json` that was forcing `@babel/helper-compilation-targets@7.26.5`
- Updated web app dependencies to latest compatible versions
- Cleaned and reinstalled all node_modules to ensure proper dependency resolution
- `ExportWizard` component now dynamically loads formats from `/export/formats` endpoint
- Export API now validates format parameter and provides detailed error messages

## 0.3.7 - Connection Recovery & Terminal Diagnostics (Jan 13, 2026)

### Bug Fixes
- **FIXED**: "Cannot connect to server" error now auto-recovers when API comes online
  - Projects page subscribes to service status updates
  - Automatically retries loading projects when API reconnects
  - Manual "Retry" button added to error message for immediate retry
  - Error clears automatically on successful connection

### Launcher Improvements
- **IMPROVED**: Completely redesigned terminal output in `run.bat` for better debugging
  - Added timestamps to all log messages `[HH:MM:SS]`
  - Event-based notifications when services come online
  - Detailed service startup information (port, path, config)
  - Status table showing all service states at completion

- **NEW**: Comprehensive diagnostic information on timeout
  - Port binding checks using `netstat`
  - Service-specific troubleshooting suggestions
  - Clear distinction between "port in use" vs "process crashed"

- **NEW**: Service Health Monitor section with clear visual feedback
  - Real-time status polling with timestamps
  - `[EVENT]` markers when services transition to ONLINE
  - Final status table showing all services and their states
  - Note about browser connection recovery behavior

### UI Improvements
- Added `RefreshCw` icon to error message with retry functionality
- Error message now shows spinning indicator during retry attempts

### Technical Changes
- Added `subscribeToServiceStatus` import to `projects.tsx`
- Added `retrying` state and `hadConnectionError` ref for connection tracking
- Added `lastApiStatus` ref to detect status transitions

## 0.3.6 - UI Improvements & Bug Fixes (Jan 13, 2026)

### Bug Fixes
- **FIXED**: Export functionality now works correctly
  - Added `exportApi.download()` method that creates export job, polls for completion, and downloads result
  - Export wizard now shows progress bar during export
  - Proper error handling with user-friendly error messages

- **FIXED**: Sidebar navigation buttons now work
  - "Assets", "Classes", and "Preview" buttons now scroll to their respective sections
  - Added refs and scroll-to-section functionality
  - Active section state properly tracked

### New Features
- **NEW**: "Refresh with New Values" button for threshold changes
  - When class thresholds are modified, a button appears to re-run inference
  - Clears existing annotations and re-processes all images with new thresholds
  - Orange gradient styling to draw attention when available
  - Tracks last-used threshold values to detect changes

### UI/UX Improvements
- **IMPROVED**: Professional color scheme overhaul
  - Switched from indigo (#6366f1) to blue (#3b82f6) as primary color
  - More refined slate-based neutral palette
  - Professional appearance suitable for data labeling platform
  - Updated light and dark theme variables
  - Refined glassmorphism effects with subtle shadows

- **IMPROVED**: Enhanced progress bars
  - Progress bar now 4x taller (h-4 instead of h-2)
  - Added animated shimmer effect during processing
  - Shows percentage complete in large bold text
  - Displays asset count progress (e.g., "45 / 89 assets")
  - Progress markers at 25%, 50%, 75%
  - Pulsing status indicator dot
  - Better visual hierarchy with icon and status text

### Technical Changes
- Added `download()` method to `exportApi` in `api.ts`
- Added `thresholdsChanged`, `onRefreshWithNewThresholds`, `isProcessing` props to `ControlPanel`
- Updated CSS variables in `index.css` for new color scheme
- Added `animate-shimmer` CSS utility class

## 0.3.5 - Labeling Interface Bug Fix (Jan 13, 2026)

### Bug Fixes
- **FIXED**: Temporal Dead Zone (TDZ) error in LabelingInterface component
  - Keyboard handler object was referencing functions before they were defined
  - Affected functions: `runPreview`, `runBatch`, `handleSelectAll`, `handleDeselectAll`
  - Wrapped function references in arrow functions for lazy evaluation
  - This fixes the "Something went wrong" error that occurred when opening the labeling interface

## 0.3.4 - Railway Deployment Support (Jan 12, 2026)

### Railway Deployment
- **NEW**: Full Railway.com deployment support
  - `railway.toml` configuration files for each service (api, web, inference)
  - Dynamic PORT support via environment variables
  - Private networking configuration for inter-service communication
  - Health check endpoints configured for Railway monitoring
- **NEW**: Comprehensive deployment guide (`RAILWAY_DEPLOYMENT.md`)
  - Step-by-step deployment instructions
  - Environment variable configuration
  - Database and storage setup guides
  - Troubleshooting section
  - Cost considerations
- **NEW**: Railway environment template (`.env.railway.example`)
  - Variable references for PostgreSQL (`${{Postgres.DATABASE_URL}}`)
  - Variable references for Redis (`${{Redis.REDIS_URL}}`)
  - S3 storage configuration options (AWS S3, Cloudflare R2, Backblaze B2)
  - Private networking URL patterns

### Dockerfile Updates
- **IMPROVED**: API Dockerfile now uses dynamic PORT environment variable
- **IMPROVED**: Inference Dockerfile now uses dynamic PORT for uvicorn
- **IMPROVED**: Web Dockerfile supports Railway with dynamic port substitution
  - Uses envsubst for nginx port configuration
  - Separate nginx.railway.conf for Railway-specific settings
  - Automatic detection of Railway environment

### Documentation
- **UPDATED**: README.md with Railway deployment quick start
- **NEW**: nginx.railway.conf for Railway-optimized web serving
  - Gzip compression enabled
  - Security headers added
  - Dynamic API proxy configuration

## 0.3.3 - Startup Diagnostics and Health Check Improvements (Jan 12, 2026)

### Bug Fixes
- **FIXED**: Health check reliability on Windows
  - Changed from PowerShell `Invoke-WebRequest` to `curl` for health checks
  - Use `127.0.0.1` instead of `localhost` to avoid IPv6 resolution issues
  - More reliable service status detection in `run.bat`

### Diagnostics Improvements
- **NEW**: Enhanced health endpoint with database connectivity check
  - Returns `503 Service Unavailable` if database is disconnected
  - Logs health check failures for easier debugging
- **NEW**: Better error logging in development mode
  - Health check and status endpoints now log when they fail (status >= 400)
  - Previously all health checks were silently excluded from logs
- **NEW**: Console logging for API debugging
  - Frontend now logs API base URL on startup
  - Health check results logged to browser console
  - Project loading status logged for troubleshooting
- **IMPROVED**: More descriptive error messages for network failures
  - "Network Error" now shows "Cannot connect to server. Please ensure the API is running."

## 0.3.1 - Security, Performance & Code Quality Improvements (Jan 8, 2026)

### Security Improvements
- **NEW**: Authentication required for inference endpoints (`/inference/text`, `/inference/points`)
- **NEW**: Secure export downloads with time-limited tokens (1-hour expiry)
  - Export files now require a valid token to download
  - Tokens are automatically generated and included in download URLs
  - Prevents unauthorized access to export archives
- **NEW**: Input validation for class creation
  - Class names must be 1-50 characters
  - Color must be valid hex format (#RRGGBB)
  - Threshold must be between 0 and 1
  - Duplicate class names are rejected

### Performance Improvements
- **NEW**: Parallel S3 operations for bulk asset deletion
  - Deletes up to 10 files concurrently instead of sequentially
  - Significant speedup for deleting large numbers of assets
- **NEW**: Database indexes added for better query performance
  - Composite index on `@@unique([projectId, name])` for ClassDef
  - Composite index on `[assetId, classId]` for Annotation
  - Composite index on `[status, kind]` for Job
- **FIXED**: N+1 query in CSV class import - now fetches all existing names in one query
- **FIXED**: Class import now uses transactions for atomicity
  - Validates all rows before inserting
  - Rolls back on any failure

### Inference Service Improvements
- **NEW**: CUDA out-of-memory error handling
  - Gracefully returns 507 status with helpful message
  - Automatically clears GPU cache on memory errors
- **NEW**: Periodic GPU memory cleanup
  - Checks memory usage before inference
  - Clears cache when usage exceeds 85%
  - Clears cache every 10 inferences to prevent fragmentation

### Frontend Improvements
- **NEW**: Working drag-and-drop file upload
  - Drop zone highlights when dragging files
  - Accepts images and videos
- **NEW**: Keyboard shortcuts help dialog in annotation canvas
  - Click "?" button to see available shortcuts
  - Shows Delete, Escape key bindings
- **NEW**: ARIA labels for accessibility
  - Canvas has proper role and aria-label attributes
  - Describes current annotation count and interaction mode
- **IMPROVED**: Type safety in useAssetAnnotation hook
  - Exported Detection interface
  - Proper tuple types for box coordinates
- **REMOVED**: Debug console.log statements from production code

### Technical Changes
- **API**: Export tokens stored in memory with 1-hour expiry and auto-cleanup
- **API**: Export job now passes userId for token generation
- **Database**: Run `bunx prisma db push` to apply new indexes
- **Frontend**: HelpCircle icon added to lucide-react imports

## 0.3.0 - Major UI Overhaul & Landing Page (Jan 2, 2026)

### UI/UX - Glassmorphism Redesign
- **NEW**: Complete glassmorphism UI overhaul across all components
  - Semi-transparent glass panels with backdrop blur
  - Gradient borders and glow effects
  - Modern dark theme optimized for professional use
  - Animated hover states and micro-interactions
- **NEW**: Enhanced CSS utility classes
  - `.glass-panel`, `.glass-card`, `.glass-button`, `.glass-input`
  - `.gradient-border`, `.gradient-border-animated`
  - `.btn-primary-gradient`, `.btn-secondary-glass`
  - `.stat-card`, `.badge-glass`, `.skeleton`
  - `.hover-lift`, `.hover-glow`, `.hover-scale`
- **IMPROVED**: Tailwind config extended with glass tokens, shadows, and animations
- **IMPROVED**: Project cards, stats cards, modals, and buttons all use new glass styling

### Performance - Image Preview Optimization
- **NEW**: Server-side thumbnail generation (300x300) on image upload
  - Thumbnails stored in S3 with `_thumb` suffix
  - Faster grid loading with smaller images
- **NEW**: Batch URL fetching API endpoint (`POST /assets/urls`)
  - Fetch up to 100 signed URLs in a single request
  - Returns both full image and thumbnail URLs
- **NEW**: Frontend URL caching with 50-minute expiry
  - Cached URLs avoid redundant API calls
  - Cache cleared on asset deletion
- **NEW**: Prefetch URLs hook for grid loading
  - Batches of 20 URLs prefetched with staggered timing
  - Significantly improves initial grid load time
- **IMPROVED**: Video frame extraction now generates thumbnails for each frame

### Export Improvements
- **FIXED**: YOLO data.yaml now uses relative paths (`.`) for cross-system portability
- **IMPROVED**: data.yaml includes generation timestamp and cleaner formatting
- **FIXED**: Exports now exclude original video files - only includes images and video frames

### Video Slicing Improvements
- **NEW**: Interactive progress bar during video slicing
  - Real-time progress percentage display
  - Estimated time remaining calculation
  - Elapsed time counter
  - Stage indicators (Upload → Download → Extract → Save → Done)
  - Animated gradient progress bar
  - Success/failure states with appropriate icons
- **FIXED**: Original video file is now deleted after successful frame extraction
  - Video asset removed from database after slicing
  - Video file removed from S3 storage after slicing
  - Only the extracted frame images remain in the project
- **FIXED**: Video uploads now correctly marked as `sourceType: 'video'` instead of `'video_frame'`
- **IMPROVED**: Polling interval reduced to 1 second for smoother progress updates
- **IMPROVED**: 10-minute timeout (up from 5 minutes) for longer videos

### Settings Enhancement
- **NEW**: Custom SAM3 model path configuration
  - Input field to specify path to pre-downloaded model checkpoint
  - Supports .pt, .pth, .safetensors formats
  - Apply button updates inference service configuration
  - Success/error feedback messages

### Landing Page
- **NEW**: Interactive landing page with GSAP vertical scroll animations
  - 5 sections: Hero, Features, Demo, Exports, CTA
  - ScrollTrigger-powered scroll animations with fade-in and slide-up effects
  - Parallax floating decorative elements
  - Staggered animations on section entry
  - Responsive navigation bar with glass styling
  - Side navigation dots for section quick-access
- **NEW**: Hero section with animated badge, gradient text, and feature pills
- **NEW**: Features section with 6 feature cards and stats row
- **NEW**: Demo carousel with 4-step interactive mockups
  - Upload, Click to Annotate, AI Magic, Export
  - Navigation controls and step indicators
- **NEW**: Export showcase with format selector and sample code
  - COCO, YOLO, Pascal VOC, PNG Masks
  - Compatible frameworks listed for each format
- **NEW**: CTA section with benefits and social links
- **INSTALLED**: GSAP 3.14.2 and @gsap/react 2.1.2

### GPU Requirement Handling
- **IMPROVED**: Graceful degradation when no CUDA GPU is available
  - Inference service starts in limited mode without crashing
  - Clear warning messages in terminal and UI
  - Settings panel shows detailed GPU requirement explanation
  - Inference status banner indicates "Manual Mode Only"
- **NEW**: Model status endpoint now includes `gpu_available`, `gpu_required`, and `status_message`
- **IMPROVED**: Frontend shows what features still work without GPU (manual annotation, export)

### Technical Changes
- **API**: Added `POST /assets/urls` for batch URL fetching
- **API**: `/assets/:id/url` now returns `thumbnailUrl` alongside `url`
- **API**: Thumbnail generation during upload using Sharp
- **Inference**: Added `SAM3_AVAILABLE` flag based on CUDA availability
- **Inference**: Model loading returns clear error when GPU not available
- **Frontend**: Added landing page route at `/`
- **Frontend**: New `src/landing/` directory with section components
- **Frontend**: GPU requirement warning in SettingsPanel and InferenceStatus
- **Dependencies**: Added gsap and @gsap/react to web package

## 0.2.16 - Bulk Asset Deletion (Jan 1, 2026)

### New Features
- **NEW**: Delete all assets in a project at once
  - "Delete Assets" button enters selection mode
  - "Delete All" button removes all assets with confirmation
  - Requires typing "DELETE ALL" to confirm for safety
  
- **NEW**: Multi-select mode for bulk asset deletion
  - Click assets to select/deselect when in selection mode
  - "Select All" and "Deselect" buttons for quick selection
  - "Delete Selected" button removes only selected assets
  - Visual indicator shows number of selected assets
  
- **NEW**: Asset selection UI
  - Checkbox overlay on assets in selection mode
  - Red highlight for selected assets
  - Badge showing selection count

### API Changes
- Added `DELETE /assets/bulk` - Delete multiple assets by IDs
- Added `DELETE /projects/:projectId/assets` - Delete all assets in project

### Technical Details
- Assets and their annotations are deleted together
- S3 files are removed along with database records
- Safe deletion with proper ownership verification

## 0.2.15 - UI Improvements & Visual Confirmations (Jan 1, 2026)

### New Features
- **NEW**: Visual confirmation modals for destructive actions
  - Clear All Annotations now shows a styled modal with animation
  - Delete Asset shows confirmation modal before deletion
  - Success animation feedback after action completes
  
- **NEW**: Video slice dialog now shows estimated frame count
  - Automatically detects video duration
  - Calculates exact number of frames to be generated
  - Shows warning for large frame counts (>100)
  - Displays video duration in MM:SS format

### UI/UX Improvements
- **ANIMATIONS**: Added button animations throughout the interface
  - Hover lift effect on primary buttons
  - Scale-down on click (active:scale-95)
  - Smooth transitions (200ms duration)
  - Bounce-in animation for success states
  
- **CSS**: New animation utility classes
  - animate-fade-in, animate-scale-in, animate-bounce-in
  - animate-slide-up, animate-slide-down
  - Custom scrollbar styling
  - Shimmer loading effect
  
- **BUTTONS**: Enhanced button interactions
  - Export button has glow effect on hover
  - Clear Annotations button has warning styling
  - Asset grid buttons scale on hover

### Components
- Added `ConfirmationModal.tsx` - Reusable confirmation dialog
  - Supports danger, warning, info types
  - Optional "type to confirm" feature
  - Processing state with spinner
  - Success animation on completion

## 0.2.14 - Auto-Install FFmpeg (Jan 1, 2026)

### Improvements
- **AUTO-INSTALL**: FFmpeg is now automatically installed during startup if not found
  - First tries winget (Windows Package Manager) - recommended
  - Falls back to Chocolatey if available
  - Provides manual instructions if both fail
- No manual intervention needed for video slicing to work on fresh installs

## 0.2.13 - FFmpeg Integration (Jan 1, 2026)

### New Features
- **NEW**: FFmpeg installation check in prerequisites
- **NEW**: Menu option [F] to install FFmpeg for video slicing support
- **NEW**: Automatic FFmpeg path detection (checks PATH, common install locations, winget)
- **NEW**: FFmpeg installation support via winget or Chocolatey

### Improvements
- FFmpeg path is automatically detected and passed to the API service
- Clear instructions provided for manual FFmpeg installation
- Video slicing feature now properly documented as requiring FFmpeg

### Installation Methods Supported
- winget (Windows Package Manager): `winget install Gyan.FFmpeg`
- Chocolatey: `choco install ffmpeg`
- Manual download from ffmpeg.org or GitHub releases

## 0.2.12 - Bug Fixes (Jan 1, 2026)

### Bug Fixes
- **FIX**: Fixed video slicing error - `uploadedAsset.id` was incorrect, should be `uploadedAsset.asset.id`
- **FIX**: Skip video files during batch inference to prevent "cannot identify image file" errors
- **FIX**: Video files are now properly uploaded and sliced into frames

### Technical Details
- Updated `useUploader.ts` to correctly access the asset ID from upload response
- Added video file detection in `handlePreviewInference` to skip non-image files
- Video slicing now correctly passes the asset ID to the backend job

## 0.2.11 - Detection Accuracy Improvements (Jan 1, 2026)

### New Features
- **NEW**: Non-Maximum Suppression (NMS) for duplicate detection removal
  - Removes overlapping bounding boxes based on IoU threshold
  - Default IoU threshold: 0.5 (configurable)
  - Prevents multiple detections of the same object

- **NEW**: Minimum box area filter
  - Filters out tiny/noise detections below minimum area
  - Default: 100 pixels (configurable)
  - Reduces false positives from small artifacts

- **NEW**: Maximum detections per class limit
  - Limits detections per class to prevent over-detection
  - Default: 100 per class (configurable)
  - Improves performance on busy images

### API Changes
- `/infer/text` endpoint now accepts:
  - `iou_threshold`: IoU threshold for NMS (0.0-1.0)
  - `min_box_area`: Minimum box area in pixels
  - `max_detections_per_class`: Max detections per class (1-500)

### Technical Details
Based on SAM3 documentation recommendations:
- Added `compute_iou()` helper for box intersection calculation
- Added `apply_nms()` for Non-Maximum Suppression
- Added `filter_detections()` for combined filtering pipeline
- Filters applied after confidence thresholding for optimal results

## 0.2.10 - Mask Opacity Control (Jan 1, 2026)

### New Features
- **NEW**: Mask opacity slider control
  - Adjustable opacity from 0% (transparent) to 100% (opaque)
  - Located in Model Settings panel when using Boxes+Masks or Masks Only mode
  - Real-time preview of opacity changes
  - Default opacity set to 30% for comfortable viewing

### UI Improvements
- **IMPROVED**: Mask visibility now dynamically controlled based on inference mode
- **IMPROVED**: Eye icon added to opacity slider for intuitive visual control

## 0.2.9 - Annotation Display & Export Fixes (Jan 1, 2026)

### Bug Fixes
- **FIXED**: JavaScript error causing "Failed to load asset details" - `polygonArray` was referenced before declaration in useAssetAnnotation.ts
- **FIXED**: Bounding boxes and masks now display correctly in the Preview canvas
- **FIXED**: Annotations now properly render after inference completion

### New Features
- **NEW**: Annotation overlays on asset thumbnails
  - Bounding boxes now display directly on thumbnail previews in the asset grid
  - Visual confirmation that assets have been annotated before opening them
  - Colors match class definitions

### Export Improvements
- **IMPROVED**: Export now uses `geometryPolygon` for accurate mask data
  - COCO format exports actual SAM3 polygon coordinates
  - YOLO segmentation format uses true segmentation polygons
  - LabelMe format exports accurate polygon shapes
  - PNG mask metadata includes both RLE and polygon data

### Technical Improvements
- **IMPROVED**: AssetGrid thumbnail component calculates box positions from actual image dimensions
- **IMPROVED**: Export service properly handles both polygon and RLE mask data

## 0.2.8 - Segmentation Mask Display Fix (Jan 1, 2026)

### Bug Fixes
- **FIXED**: Segmentation masks now display correctly in the annotation canvas
  - Added `geometryPolygon` field to database schema to store polygon points
  - Backend now saves polygon data from SAM3 inference alongside RLE data
  - Frontend properly loads and renders mask polygons
  - Masks display as semi-transparent overlays on the image

### Database Changes
- **NEW**: `geometryPolygon` field added to annotations table
  - Stores polygon coordinates [[x1,y1], [x2,y2], ...] for efficient rendering
  - Run `bunx prisma db push` to update your database

### Technical Improvements
- **IMPROVED**: useAssetAnnotation hook properly maps polygon data from API
- **IMPROVED**: Better debug logging for annotation loading

## 0.2.7 - Video Slicing & Segmentation Modes (Dec 31, 2025)

### New Features
- **NEW**: Video frame slicing dialog on upload
  - When uploading a video, a dialog appears to configure frame extraction
  - Preset options: 1 frame/sec, 1 frame/2 sec, 1 frame/5 sec, 1 frame/10 sec
  - Custom slider from 0.5 to 30 seconds between frames
  - Custom numeric input for precise control
  - Video is automatically sliced into individual frames after upload
- **NEW**: Inference mode selection for segmentation
  - Three radio button options in Model Settings:
    - **Boxes Only**: Bounding boxes for object detection
    - **Boxes + Masks**: Both bounding boxes and segmentation masks (default)
    - **Masks Only**: Semantic segmentation masks without boxes
  - Mode is passed to SAM3 inference and annotations are saved accordingly

### Technical Improvements
- **NEW**: `VideoSliceDialog` component for video upload configuration
- **IMPROVED**: `useUploader` hook detects video files and shows slice dialog
- **IMPROVED**: Backend inference handler respects `inferenceMode` parameter
- **IMPROVED**: Annotations store only requested data (box, mask, or both)

## 0.2.6 - Class Management in Labeling (Dec 31, 2025)

### New Features
- **NEW**: Add classes directly from the labeling interface
  - "Add Class" button in the Class Thresholds section
  - Color picker to choose class color from predefined palette
  - Text input for class name
  - Press Enter or click Add button to create
- **NEW**: Delete classes from the labeling interface
  - Trash icon next to each class
  - Confirmation dialog before deletion
  - Removes associated annotations when class is deleted

### UI/UX Improvements
- **IMPROVED**: Class Thresholds section header now shows "Add Class" button
- **IMPROVED**: Delete button only appears when hovering on class row

## 0.2.5 - Inference Progress & Export Fixes (Dec 31, 2025)

### New Features
- **NEW**: Inference job progress bar in labeling interface
  - Real-time progress tracking for SAM3 inference jobs
  - Shows percentage and descriptive status messages
  - Progress updates after each asset is processed
  - Gradient progress bar with smooth animations
- **IMPROVED**: Generic job status endpoint now includes progress for all job types
  - Export, Inference, and Video Slicing jobs all report progress
  - Consistent progress message format across job types

### Bug Fixes
- **FIXED**: Export file naming now works correctly
  - Download URL properly uses result.downloadPath from job completion
  - Added console logging to debug download URL construction
  - Files are named: `YYYY-MM-DD_HHMM_format_Nimages.zip`

### Technical Improvements
- **IMPROVED**: useJobPolling hook now exposes progress and progressMessage
- **IMPROVED**: Job interface updated to include progress fields
- **IMPROVED**: Polling interval reduced to 1 second for smoother progress updates

## 0.2.4 - Export Progress & Quick Navigation (Dec 31, 2025)

### New Features
- **NEW**: Export progress bar with real-time updates
  - Visual progress bar showing export completion percentage
  - Status messages: "Fetching data", "Downloading images", "Creating archive"
  - Polls every second for smooth updates
- **NEW**: Descriptive export file naming
  - Files now named: `YYYY-MM-DD_HHMM_format_Nimages.zip`
  - Example: `2025-12-31_1430_coco_25images.zip`
  - Makes it easy to identify exports

### UI/UX Improvements
- **REMOVED**: "Smart Auto-Labeling" button from project detail view header
  - Only "Start Labeling" button remains for cleaner interface
  - Smart Auto-Labeling still available from main projects list
- **NEW**: Click on assets to open labeling page
  - Clicking any asset thumbnail opens the labeling interface
  - Clicking "Assets (N)" heading also navigates to labeling
  - Hover effect shows which items are clickable
- **IMPROVED**: "Click to label" hint next to Assets heading

## 0.2.3 - Project Detail Redesign & Stability (Dec 31, 2025)

### Major UI Changes
- **REDESIGNED**: Project detail view now expands full-width when clicking a project
  - Shows all assets in a larger grid (8 columns)
  - Classes panel on the left, assets on the right
  - Stats cards showing total assets, classes, and labeled count
  - Back button to return to project list
  - All action buttons (Start Labeling, Smart Auto-Labeling) in the header
- **NEW**: "Clear All Annotations" button added to labeling page header
  - Visible when working on a project with assets
  - Same confirmation dialog as project view
- **IMPROVED**: Export format selector now uses text symbols instead of emojis
  - [JSON] for COCO, [YOLO] for YOLO detect, [SEG] for segmentation, etc.
  - Better compatibility across systems and terminals

### Terminal/Logging Improvements
- **IMPROVED**: Much cleaner terminal output for the API server
  - Startup banner with configuration summary
  - Colored status indicators (green ✓ for success, red ✗ for errors)
  - Request logging filters out noisy health checks and status polls
  - Job processing logs show type, duration, and success/failure status
  - Database connection shown with simple checkmark
- **FIXED**: Disabled verbose Fastify request logging in development mode
  - Only significant requests are logged (not every asset URL request)

### Technical Fixes
- **FIXED**: Export archive creation now uses system commands (PowerShell/zip)
  - Resolves Bun compatibility issues with the archiver library
  - Falls back to creating a manifest file if archive creation fails
- **FIXED**: Added proper import for `projects` API in labeling page

## 0.2.2 - Export Improvements & UI Enhancements (Dec 31, 2025)

### New Features
- **NEW**: "Clear All Annotations" button in project detail panel
  - Removes all annotations from all images in a project at once
  - Confirmation dialog to prevent accidental deletion
- **NEW**: Export now includes actual images alongside annotations
  - Images are downloaded from S3 and bundled in the export archive
  - Follows standard directory conventions for each format (images/, JPEGImages/, etc.)
- **IMPROVED**: Project preview thumbnails now load correctly using signed S3 URLs
  - Lazy loading for performance
  - Fallback placeholder on error

### UI/UX Changes
- **RENAMED**: "Label" button changed to "Start Labeling" for clarity
- **MOVED**: "Smart Auto-Labeling" button is now in the header toolbar (next to "New Project")
  - Only visible when a project is selected
  - Gradient styling for visual distinction from other actions
- **IMPROVED**: "Clear All Annotations" button redesigned with prominent styling
  - Full-width button with red border at the bottom of project detail panel
  - Better visibility and easier access

### Repository Fixes
- **FIXED**: Removed 3.3GB model file (sam3.pt) from git tracking
  - Model files are now in .gitignore
  - Use `download_models.py` to download models separately

### API Changes
- **NEW**: `DELETE /projects/:projectId/annotations` - Clear all annotations from a project
- **IMPROVED**: Export service now downloads images from S3 and includes them in exports

## 0.2.1 - SAM3 API Fix & UX Improvements (Dec 31, 2025)

### Critical Fixes
- **FIXED**: SAM3 inference API now correctly extracts results from `set_text_prompt()` return state
  - Previous code called non-existent `get_results()` method
  - Results are now properly extracted from state["masks"], state["boxes"], state["scores"]
- **FIXED**: MinIO 403 Forbidden errors when inference service downloads images
  - API now generates signed URLs for assets before sending to inference service
  - Signed URLs have 1-hour expiry for security
- **FIXED**: Suggested class labels (person, car, dog, etc.) now work correctly
  - Fixed React state race condition where promptInput wasn't updated before addPromptLabel was called
  - Now adds labels directly without relying on async state updates

### UI/UX Improvements
- **NEW**: Color picker for prompt labels in BuildFlow wizard
  - Native HTML color input for easy color selection
  - Color is now clickable to change directly
- **NEW**: Enhanced color picker in ControlPanel (labeling page)
  - Predefined color palette with 20 colors
  - Custom color input with hex code support
  - Apply button for custom colors
- **IMPROVED**: Video Frame Interval setting only shows when video assets are present
  - Cleaner UI when working with images only
  - Setting remains available when videos are uploaded
- **NEW**: Asset thumbnails now show actual images instead of placeholder icons
  - Lazy loading for performance
  - Video assets still show video icon (thumbnails not supported)
- **NEW**: Asset filtering by annotation status
  - Filter buttons: All, Labeled (with annotations), Unlabeled (without)
  - Visual indicator (checkmark/circle) showing annotation count on each asset
  - Filtered count display ("X of Y" format)
- **IMPROVED**: Bounding box visibility on AnnotationCanvas
  - Thicker stroke widths (2.5px default, 3px hover, 4px selected)
  - Added subtle fill overlay (8% opacity) for better visibility
  - Better validation of box coordinates with debug logging
- **IMPROVED**: Annotation data handling from Prisma JSON fields
  - Robust parsing of box arrays from various JSON formats
  - Debug logging to help diagnose annotation loading issues

### Technical Improvements
- **IMPROVED**: SAM3 processor now uses `set_confidence_threshold()` for faster filtering
- **IMPROVED**: Better error handling and logging in inference functions
- **IMPROVED**: Point/box inference now uses correct `add_geometric_prompt()` method

## 0.2.0 - Major Redesign (Dec 31, 2025)

### Authentication
- **NEW**: Clerk authentication integration with Google OAuth
- **REMOVED**: Custom email/password authentication
- **NEW**: ClerkProvider wrapped in main.tsx (following official Clerk guidelines)
- **NEW**: ClerkTokenProvider for API token management
- **NEW**: Clerk JWT verification on backend
- **NEW**: afterSignOutUrl configured for proper sign-out redirect
- **FIXED**: Auth race condition causing redirect loops on protected pages
- **FIXED**: Projects page now waits for Clerk auth to be fully loaded before API calls
- **FIXED**: API interceptor uses `window.location.replace` to avoid browser history pollution
- **FIXED**: ClerkTokenProvider now waits for auth to be loaded before rendering children
- **FIXED**: Token getter is set up synchronously to prevent API calls without auth tokens
- **FIXED**: API 401 handler no longer redirects if auth hasn't been initialized yet
- **FIXED**: BuildFlowWrapper now checks auth before making API calls
- **FIXED**: useProjectData hook now checks auth before making API calls
- **FIXED**: All protected route components now properly guard against unauthenticated API calls
- **FIXED**: API server now loads .env from monorepo root (for CLERK_SECRET_KEY)
- **FIXED**: API server logs Clerk configuration status on startup for debugging
- **FIXED**: Asset preview URLs in projects page now use correct URIs

### Theme System
- **NEW**: Dark/Light/System theme support with CSS variables
- **NEW**: ThemeToggle component with three modes
- **NEW**: Theme-aware styling throughout the application
- **NEW**: System preference detection via `prefers-color-scheme`
- **NEW**: Theme persistence in localStorage

### Database Schema Simplification
- **BREAKING**: Removed Dataset model - projects now contain assets directly
- **CHANGED**: Assets now reference projectId instead of datasetId
- **CHANGED**: All API endpoints updated to use project-based structure
- **CHANGED**: Upload API now uses projectId query parameter
- **CHANGED**: Export and video slicing now operate on projects

### Project Dashboard Redesign
- **NEW**: Redesigned projects page with grid/list view toggle
- **NEW**: Class management panel with add/edit/delete
- **NEW**: Color picker for class colors
- **NEW**: Confidence threshold slider per class
- **NEW**: CSV import/export for class definitions
- **NEW**: Asset preview grid in project detail panel
- **NEW**: Search functionality for projects

### Service Status
- **NEW**: ServiceStatusIndicator component with connection status
- **NEW**: API health check with automatic reconnection detection
- **NEW**: Inference service status monitoring
- **NEW**: Expandable status details popup
- **NEW**: Manual refresh button for status checks
- **NEW**: getErrorMessage helper for user-friendly error messages
- **NEW**: Service status subscription system

### API Improvements
- **NEW**: `/projects/:projectId/classes/export` - Export classes to CSV
- **NEW**: `/projects/:projectId/classes/import` - Import classes from CSV
- **NEW**: `/projects/:projectId/assets` - Direct asset listing
- **CHANGED**: All dataset endpoints replaced with project-based equivalents
- **IMPROVED**: Better error messages with axios error handling

### Frontend Components
- **NEW**: ThemeToggle.tsx - Theme mode switcher
- **NEW**: ServiceStatusIndicator.tsx - Connection status display
- **NEW**: ClerkTokenProvider.tsx - Clerk token integration
- **IMPROVED**: BuildFlow now uses projectId for uploads
- **IMPROVED**: Projects page with UserButton from Clerk

### Dependencies
- **ADDED**: @clerk/clerk-react for frontend auth
- **ADDED**: @clerk/backend for API auth

## Unreleased

### System Overhaul (Dec 28, 2025)

#### SAM3 Model Management Improvements
- **IMPROVED**: Complete rewrite of `main.py` model loading with robust error handling
- **IMPROVED**: Added `ModelState` class for thread-safe model state management
- **IMPROVED**: Added checkpoint validation before loading (file size, existence checks)
- **IMPROVED**: Added `/models/sam3/verify` endpoint to test model functionality
- **IMPROVED**: Added `/settings` endpoints for configurable inference settings
- **IMPROVED**: Better SAM3 import logic with multiple fallback paths
- **IMPROVED**: Enhanced logging with clear success/failure indicators
- **IMPROVED**: Model download now includes retry logic with exponential backoff
- **IMPROVED**: `download_models.py` now supports progress callbacks and integrity validation
- **ADDED**: ModelScope as primary download source (no auth required)
- **ADDED**: HuggingFace as fallback download source
- **ADDED**: Download progress tracking with started_at/completed_at timestamps

#### Frontend Settings System
- **NEW**: `SettingsContext.tsx` - centralized app-wide settings state management
- **NEW**: `SettingsPanel.tsx` - comprehensive tabbed settings UI with 5 categories:
  - Model: Status, download, load/unload controls, GPU memory display
  - Inference: Confidence threshold, timeout, preload settings
  - Display: Confidence scores, masks, zoom sensitivity
  - Export: Default format, masks, video frame interval
  - Storage: Models directory info, cache management
- **NEW**: `InferenceStatus.tsx` - unified status component with 3 variants (compact/detailed/banner)
- **NEW**: `OnboardingWizard.tsx` - first-run experience with system checks
- **IMPROVED**: App.tsx now wraps content with SettingsProvider
- **IMPROVED**: Settings persist to localStorage with API sync

#### Backend Resilience
- **ADDED**: Inference proxy timeout with configurable `INFERENCE_TIMEOUT_MS` (default 60s)
- **ADDED**: Retry logic with exponential backoff for inference calls (`INFERENCE_MAX_RETRIES`)
- **ADDED**: Proper abort handling for timed-out requests
- **IMPROVED**: Better error messages distinguishing timeout vs unavailable

#### Production Deployment
- **IMPROVED**: `docker-compose.prod.yml` with health checks for all services
- **IMPROVED**: Added resource limits and reservations for memory management
- **IMPROVED**: Added `minio-init` container for automatic bucket creation
- **IMPROVED**: Added `inference_models` volume for persistent model storage
- **IMPROVED**: GPU support configuration (commented, ready to enable)
- **IMPROVED**: Separated worker service for background job processing
- **ADDED**: PostgreSQL, Redis, MinIO health checks with proper conditions

#### Dependencies
- **ADDED**: `modelscope>=1.10.0` to inference requirements for model downloads

### Bug Fixes (Dec 17, 2025)
- **FIXED**: Added missing `python-multipart` dependency to inference service - required by FastAPI for file uploads
- **FIXED**: Inference service now starts correctly without crashing on `/infer/upload` endpoint
- **FIXED**: API job handler now uses correct SAM3 inference endpoint (`/infer/text`) with proper request format
- **FIXED**: API job handler now processes assets individually and supports per-class threshold filtering
- **FIXED**: Fixed Fastify deprecation warning - replaced `request.routerPath` with `request.routeOptions.url`
- **FIXED**: Fixed minThreshold calculation that was incorrectly capped at 0.5 - now correctly uses minimum of class thresholds
- **FIXED**: Fixed route path fallback to strip query parameters - prevents auth/rate-limit failures for public routes with query strings
- **FIXED**: Fixed run.bat port mismatch - web health check and display now correctly use port 3000 (matching vite.config.ts)
- **FIXED**: Added error handling to run.bat background service starts to prevent unexpected window closure
- **IMPROVED**: API inference job handler now logs detailed progress and errors for each asset
- **IMPROVED**: API inference job now updates asset dimensions from inference response

### SAM3 Integration (Major Update)
- **INFERENCE**: Complete rewrite of inference service to use SAM3 (Segment Anything Model 3) exclusively
- **INFERENCE**: Added text-prompt based object detection with `POST /infer/text` endpoint
- **INFERENCE**: Added point/box prompt inference with `POST /infer/points` endpoint
- **INFERENCE**: SAM3 auto-downloads checkpoints from HuggingFace on first load
- **INFERENCE**: Integrated Sam3Processor for native text prompt handling
- **API**: Added proxy routes for SAM3 inference endpoints (`/inference/text`, `/inference/points`, `/inference/gpu`)
- **FRONTEND**: New 4-step BuildFlow wizard (Upload > Prompt > Review > Export) similar to Roboflow Rapid
- **FRONTEND**: Text prompt input component with "Find Objects" button and suggested labels
- **FRONTEND**: Interactive AnnotationCanvas with box drawing, selection, mask rendering, and resize handles
- **FRONTEND**: Per-class confidence threshold sliders with real-time filtering
- **FRONTEND**: FrameNavigator for video timeline scrubbing with keyboard shortcuts
- **FRONTEND**: "Smart Annotate" button in Projects view to launch the SAM3-powered annotation flow
- **EXPORT**: All 8 export formats verified: COCO, YOLO Detect, YOLO Segment, Pascal VOC, PNG Masks, CreateML, TFRecord Meta, LabelMe
- **DEPS**: Updated requirements.txt to include SAM3 from GitHub repository

### Previous Changes
- **SECURITY**: Fixed insecure JWT secret fallback - now warns when using default secret
- **VALIDATION**: Added comprehensive input validation for auth endpoints (email format, password length)
- **VALIDATION**: Added input validation for project creation (name length, required fields)
- **VALIDATION**: Added file type and extension validation for uploads
- **ERROR HANDLING**: Improved error handling throughout API with proper cleanup of temporary files
- **ERROR HANDLING**: Added better error handling for S3 operations
- **UI/UX**: Added client-side form validation and better error display in auth component
- **UI/UX**: Added loading states and error handling in projects component
- **UI/UX**: Added empty state handling for projects list
- **UI/UX**: Rebuilt Projects workspace with hero, stats, quick actions, and direct "Upload / Label" buttons that jump into the labeling flow with the chosen dataset.
- **UI/UX**: Labeling screen shows inference health (device, CUDA, loaded models) with one-click preload buttons for SAM/SAM2/SAM3.
- **INFERENCE**: Added input validation and limits to inference service
- **INFERENCE**: Added memory management endpoints and automatic cleanup
- **INFERENCE**: Added batch size limits and model validation
- **INFERENCE**: Added load/unload proxy endpoints and detailed model load errors (including missing checkpoints) surfaced to clients.
- **FIXED**: `run.bat` now properly starts all services without port conflicts or database authentication errors.
- **FIXED**: API now has built-in defaults for DATABASE_URL, REDIS_URL, and S3 credentials - works without a `.env` file.
- **FIXED**: Added automatic process cleanup (bun.exe, node.exe) before starting services to prevent port conflicts.
- **FIXED**: Created Python virtual environment in `apps/inference/.venv` for uvicorn and dependencies.
- **FIXED**: Changed Redis port from 6379 to 6380 in docker-compose to avoid conflicts with Windows Redis service.
- **FIXED**: Changed PostgreSQL port from 5432 to 5433 in docker-compose to avoid conflicts with Windows PostgreSQL service.
- **FIXED**: Projects page no longer crashes when datasets are returned without assets; project selection now refetches full details and falls back to empty asset arrays.
- Harden `run.bat`: auto-start Docker Desktop when the daemon is down, wait for readiness, fail fast with guidance, detect Compose plugin, use `uv` for Python installs, and rely on Compose service names for MinIO bucket creation.
- Remove deprecated `version` key from Compose files to silence warnings.
- Refresh docs (README/structure) to reflect launcher usage, `uv` requirement, and Docker daemon readiness checks.
- Allow passing the menu choice as the first argument to `run.bat` (e.g., `run.bat 1`) for non-interactive automation; recommend running from `cmd` rather than PowerShell pipes to avoid parser quirks.

## 0.0.1 (WIP)
- Initialize monorepo scaffolding (apps/api, apps/web, apps/inference, packages/shared, infra).
- Add base configs and ignore rules.
- Document planned layout and quickstart.
- Add Dockerfiles for all services (API, Web, Inference).
- Add production docker-compose.yml for deployment.
- Add deployment documentation and environment configuration.
- Add nginx configuration for web service.

# Security Policy

## Supported Versions

Lableit is pre-1.0 software. Security fixes are applied to the latest released
version and the `main` branch only. Older versions are not maintained.

| Version | Supported |
|---------|-----------|
| Latest release / `main` | Yes |
| Any older tag | No |

Always run the most recent version. See `CHANGELOG.md` for the current version.

## Reporting a Vulnerability

Please report security vulnerabilities **privately**. Do **not** open a public
GitHub issue for a security problem.

1. Email **Sabek@ualberta.ca** with:
   - a description of the vulnerability and its impact,
   - steps to reproduce (proof-of-concept if available),
   - affected component(s): `apps/api`, `apps/web`, `apps/inference`, infra, or
     deployment configuration,
   - the version / commit you tested.
2. You should receive an acknowledgement within a few business days.
3. Please allow a reasonable disclosure window before any public disclosure so a
   fix can be prepared and released.

You can also use GitHub's private **Report a vulnerability** button on the
repository's Security tab, if it is enabled. Please do not open a public issue
for security problems.

## The most important thing to know

**Lableit has no authentication.** There are no accounts, no login and no
permissions: every API route and every screen is open to whoever can reach the
port. That is deliberate. Lableit is a research tool you run yourself, and
requiring a hosted identity provider just to label images on your own laptop was
friction without benefit for that use.

The consequence is simple and absolute:

> **Anyone who can reach the app can read, modify and delete everything in it,
> and can drive the SAM3 service behind it.**

Run it the way it is designed to be run:

- On `localhost`, which is the default for every service.
- Or on a machine only you can reach, for example behind your institution's VPN,
  over an SSH tunnel, or behind a reverse proxy that does the authenticating.
- **Never put it on the open internet as it ships.** If you need to, put a real
  authenticating proxy in front of it, and treat the API and the inference
  service as an internal network.

Reports that amount to "there is no authentication" are therefore not
vulnerabilities, they are this design. Reports that an *authenticated-equivalent*
boundary inside the app can be crossed, or that a request can reach outside its
own project, read arbitrary files, or execute code, absolutely are: please send
those through the private channel above.

## Scope and Hardening Notes

### Inference service must run on a private network

The inference service (`apps/inference`, FastAPI + SAM3) ships with **zero
authentication** as well, and it will fetch any image URL it is handed. It is
designed to sit on a **private network only** (for example Docker Compose's
internal network) and to be reached exclusively by the API service.

- **Never expose the inference service directly to a public network.**
- Keep `INFERENCE_URL` pointed at a private address (e.g. `http://inference:8001`).
- `INFERENCE_ALLOWED_ORIGINS` restricts its CORS; `INFERENCE_SHARED_SECRET` is
  read by the inference service but the API does not send the header, so leave it
  unset and rely on network isolation.

### What the API does still enforce

Even with no accounts, these protect a single user from a malformed or hostile
request:

- **Project scoping:** classes and tags must belong to the project they are
  attached to; inference jobs must target assets from one project; video slicing
  is pinned to that project's own storage prefix and rejects `..` segments.
- **Input validation:** the video frame interval is validated as a bounded number
  before it reaches ffmpeg, names and colours are checked, and uploads are capped
  at 500 MB with an extension allowlist.
- **Object storage:** assets are served through short-lived (1-hour) signed S3
  URLs; export downloads use single-use, time-limited tokens held in Redis.
- **Security headers** via helmet, and a simple in-memory per-IP/route rate limit
  (100 requests per minute). For multi-instance setups use an external limiter.
- **CORS:** set `ALLOWED_ORIGINS` if a browser on another origin must call the API.

### Secrets that still matter

`S3_ACCESS_KEY` / `S3_SECRET_KEY`, the database password and any `HF_TOKEN` are
real credentials: keep them in your local `.env`, which is gitignored, and never
commit them.

Please report any deviation from these expectations through the private channel
above.

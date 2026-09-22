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

## Scope and Hardening Notes

### Inference service must run on a private network

The inference service (`apps/inference`, FastAPI + SAM3) ships with **zero
authentication by default** — every endpoint is open to any caller that can
reach the service. It is designed to sit on a **private network only** (for
example, Docker Compose's internal network or Railway private networking via
`*.railway.internal`) and to be reached exclusively by the API service.

- **Never expose the inference service directly to the public internet.**
- Keep `INFERENCE_URL` pointed at a private/internal address (e.g.
  `http://inference.railway.internal:8080` or `http://inference:8001`).
- The API service is the authenticated front door: its inference proxy routes
  (`POST /inference/text`, `POST /inference/points`) require a valid Clerk or
  JWT session before forwarding to the inference service.

> **TODO (maintainer):** A shared-secret guard for the inference service
> (e.g. an `INFERENCE_SHARED_SECRET` header checked on every inference request)
> is recommended as defense-in-depth but is **not yet implemented**. Until then,
> rely strictly on network isolation. If/when implemented, the API would attach
> the secret and the inference service would reject requests lacking it.

### Other security-relevant defaults

- **Authentication:** The API uses Clerk JWT verification (with a legacy
  `@fastify/jwt` fallback) on all non-public routes. Public routes are limited
  to `/health`, `/auth/register`, `/auth/login`, and a few read-only inference
  status endpoints.
- **Secrets:** `JWT_SECRET`, `CLERK_SECRET_KEY`, and `S3_*` credentials must be
  set via environment variables. In production the API **fails fast** if
  required secrets are missing; do not ship the development fallback secret.
- **Object storage:** Assets are served via short-lived (1-hour) signed S3 URLs.
  Export downloads use single-use, time-limited tokens (1-hour TTL in Redis).
- **CORS:** In production, set `ALLOWED_ORIGINS` to your exact web origin(s).
- **Rate limiting:** A simple in-memory per-IP/route rate limit is enabled
  (100 requests/minute/route). For multi-instance deployments use an external
  rate limiter or gateway.

Please report any deviation from these expectations through the private channel
above.

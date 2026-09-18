# Third-Party Licenses

Lableit (Copyright (c) 2024-2026 Mohamed Sabek) is distributed under the
Lableit Academic Research License 1.0 (see [`LICENSE`](./LICENSE)): academic use
only, other uses by written permission (see [`PERMISSIONS.md`](./PERMISSIONS.md)).

Lableit's own license covers **only Lableit's source code**. The platform
depends on third-party components, each governed by its own license. This
document enumerates those components, their licenses, and required attributions.
See also the [`NOTICE`](./NOTICE) file for attribution notices that must be
preserved.

This list is derived from `apps/api/package.json`, `apps/web/package.json`,
`packages/shared`, and `apps/inference/requirements.txt`. Transitive
dependencies carry their own licenses; run `bun pm ls` / inspect `bun.lock` and
`uv pip list` for a complete transitive inventory.

> Important callouts:
> - **GSAP / @gsap/react are NOT open source** (proprietary GreenSock license).
> - **Meta SAM License** governs both the `sam3` package and the SAM3 weights.
>   Lableit does **not** redistribute SAM3 weights.
> - **sharp** is Apache-2.0 but bundles **libvips (LGPL-3.0)**.

---

## 1. Apache-2.0 components (NOTICE preservation required)

The Apache License 2.0 requires that you retain attribution notices. These are
preserved in [`NOTICE`](./NOTICE).

| Component | Package(s) | License | Copyright / Source |
|-----------|------------|---------|--------------------|
| AWS SDK for JavaScript v3 | `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `@aws-sdk/s3-request-presigner` | Apache-2.0 | Amazon.com, Inc. — https://github.com/aws/aws-sdk-js-v3 |
| Prisma | `prisma`, `@prisma/client` | Apache-2.0 | Prisma Data, Inc. — https://github.com/prisma/prisma |
| TypeScript | `typescript` | Apache-2.0 | Microsoft Corporation — https://github.com/microsoft/TypeScript |
| sharp | `sharp` | Apache-2.0 | Lovell Fuller and contributors — https://github.com/lovell/sharp |

Apache-2.0 license text: http://www.apache.org/licenses/LICENSE-2.0

### sharp → libvips (LGPL-3.0)

`sharp` ships prebuilt binaries of **libvips**, which is licensed under the
**GNU Lesser General Public License v3.0 (LGPL-3.0)**.

- libvips source: https://github.com/libvips/libvips
- LGPL-3.0 text: https://www.gnu.org/licenses/lgpl-3.0.html

Lableit uses libvips as a loosely/dynamically linked image-processing library
through `sharp`; it does not modify libvips. If you redistribute Lableit, you
must comply with the LGPL-3.0 (e.g. preserve notices and provide a way to obtain
the libvips source and relink). The unmodified upstream source is available at
the URL above.

---

## 2. MPL-2.0 components

| Component | Package(s) | License | Source |
|-----------|------------|---------|--------|
| lightningcss (if present) | transitive (may be pulled in by Vite/Tailwind tooling) | MPL-2.0 | https://github.com/parcel-bundler/lightningcss |

MPL-2.0 is a file-level copyleft license. lightningcss is not a direct
dependency in `apps/web/package.json`; it may appear transitively via the Vite
build toolchain. If present, MPL-2.0 requires that modifications to MPL-licensed
files be made available under MPL-2.0. MPL-2.0 text:
https://www.mozilla.org/en-US/MPL/2.0/

---

## 3. GSAP — Proprietary "No Charge" Standard License (NOT open source)

| Component | Package(s) | License |
|-----------|------------|---------|
| GSAP | `gsap` | GreenSock Standard "No Charge" License (proprietary) |
| GSAP React wrapper | `@gsap/react` | GreenSock Standard "No Charge" License (proprietary) |

GSAP is **not** distributed under an open-source license. Usage is governed by
the GreenSock Standard License:

- License terms: https://gsap.com/community/standard-license

The "No Charge" Standard License permits use in most projects at no cost, but
**prohibits** certain uses (for example, sale of the GSAP code itself or use in
products where end users are charged specifically for GSAP-driven features).
Some commercial scenarios require a paid "Club GreenSock" license. If you fork
or commercially distribute Lableit, review the GreenSock license terms and
obtain the appropriate GreenSock license if required.

---

## 4. Meta SAM License — SAM3 package and weights

| Component | Source | License |
|-----------|--------|---------|
| `sam3` Python package | `git+https://github.com/facebookresearch/sam3.git@c97c893969003d3e6803fd5d679f21e515aef5ce` | Meta SAM License |
| SAM3 model weights/checkpoints | Downloaded by the user from ModelScope (primary) or Hugging Face (fallback) | Meta SAM License |

Both the SAM3 software package and the SAM3 model weights are governed by Meta's
separate **SAM License** (not an OSI-approved open-source license).

**Lableit does NOT redistribute the SAM3 model weights.** The inference service
downloads weights at runtime from ModelScope or Hugging Face; the operator/user
downloads them and **accepts Meta's SAM License themselves**. See
`apps/inference/download_models.py` for the download flow.

The SAM License also requests acknowledgement of the SAM 3 research. The
required citation is provided in [`CITATION.cff`](./CITATION.cff):

> Carion et al. (2025). "SAM 3: Segment Anything with Concepts." arXiv:2511.16719.

---

## 5. Python dependencies (`apps/inference/requirements.txt`)

| Component | License |
|-----------|---------|
| FastAPI (`fastapi`) | MIT |
| uvicorn (`uvicorn[standard]`) | BSD-3-Clause |
| Pydantic (`pydantic`) | MIT |
| python-multipart | Apache-2.0 |
| Pillow | MIT-CMU (HPND) |
| opencv-python | Apache-2.0 (OpenCV); wheels bundle FFmpeg/other libs under their own licenses |
| NumPy | BSD-3-Clause |
| requests | Apache-2.0 |
| sse-starlette | BSD-3-Clause |
| modelscope | Apache-2.0 |
| huggingface-hub | Apache-2.0 |
| `sam3` (GitHub) | Meta SAM License (see §4) |
| einops | MIT |
| decord | Apache-2.0 |
| pycocotools | BSD-2-Clause |
| python-json-logger | BSD-2-Clause |
| psutil | BSD-3-Clause |
| PyTorch (`torch`, `torchvision`, `torchaudio`) — installed separately, see `requirements.txt` comments and `run.bat` | BSD-style (3-Clause BSD) |

> PyTorch is installed outside `requirements.txt` (the file documents the
> intended versions in comments; `run.bat` selects a CUDA-enabled wheel on GPU
> hosts). PyTorch is distributed under a BSD-style license. Some PyTorch
> components and bundled CUDA libraries (NVIDIA) carry their own NVIDIA license
> terms.

---

## 6. Node/Bun dependencies (`apps/api/package.json`, `apps/web/package.json`, `packages/shared`)

### API (`apps/api`)

| Component | License |
|-----------|---------|
| `@aws-sdk/*` | Apache-2.0 (see §1) |
| `@prisma/client`, `prisma` | Apache-2.0 (see §1) |
| `@clerk/backend` | MIT |
| `fastify`, `@fastify/cors`, `@fastify/jwt`, `@fastify/multipart`, `@fastify/static` | MIT |
| `bcrypt` | MIT |
| `bullmq` | MIT |
| `dotenv` | BSD-2-Clause |
| `ioredis` | MIT |
| `pino` | MIT |
| `sharp` | Apache-2.0 + bundled libvips LGPL-3.0 (see §1) |
| `yazl` | MIT |
| `typescript` | Apache-2.0 (see §1) |
| `@types/*`, `bun-types` | MIT |

### Web (`apps/web`)

| Component | License |
|-----------|---------|
| `react`, `react-dom` | MIT |
| `@clerk/clerk-react` | MIT |
| `react-router-dom` | MIT |
| `axios` | MIT |
| `follow-redirects` | MIT |
| `lucide-react` | ISC |
| `gsap`, `@gsap/react` | GreenSock proprietary (see §3) |
| `vite`, `@vitejs/plugin-react` | MIT |
| `tailwindcss` | MIT |
| `postcss`, `autoprefixer` | MIT |
| `eslint` | MIT |
| `vitest` | MIT |
| `typescript` | Apache-2.0 (see §1) |

### Shared (`packages/shared`)

`packages/shared` contains only Lableit's own TypeScript type definitions
(covered by Lableit's license) and uses `typescript` (Apache-2.0) as a tool.

---

## How this list was produced

Direct dependencies were read from the manifests listed above. License
identifiers reflect each project's published license at the pinned major
version. For a binding, transitive inventory, regenerate from the lockfiles:

```bash
# Node/Bun (run from the repo root)
bun pm ls

# Python (inside the inference virtualenv)
uv pip list
```

If you redistribute Lableit, verify the license of every component you actually
ship, especially the GSAP, libvips (LGPL-3.0), and Meta SAM License obligations.

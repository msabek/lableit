# Lableit Inference Service Dockerfile
# Build context: apps/inference (self-contained, all COPY paths are app-local).
#
# IMPORTANT: this CPU base image is UNTESTED here (Docker is not installed on the
# build host). For GPU deployments, override the base image with an
# nvidia/cuda or pytorch/pytorch CUDA image and install a CUDA-matched torch
# wheel (see the commented guidance below). SAM3 requires CUDA at runtime
# (hardcoded device="cuda"); on CPU the service degrades to limited mode.

FROM ghcr.io/astral-sh/uv:0.9.6 AS uv

# Canonical Python is 3.11 across the project.
FROM python:3.11-slim

WORKDIR /app

# Install the uv binary from the pinned uv image.
COPY --from=uv /uv /uvx /bin/

# System dependencies:
#   curl    - container healthcheck
#   git     - SAM3 is installed from a pinned GitHub commit (see requirements.txt)
#   libgl1/libglib2.0-0 - required by opencv-python
RUN apt-get update && apt-get install -y \
    curl \
    git \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# --- PyTorch -------------------------------------------------------------------
# requirements.txt intentionally leaves torch commented out because the correct
# wheel depends on the target hardware. main.py does `import torch` at module
# load (line 12), so torch MUST be installed here or the service crashes on
# startup. We install an explicit, pinned CPU build by default.
#
# GPU deployments: switch the base image to a CUDA image AND replace the line
# below with a CUDA-matched wheel, e.g. (CUDA 12.8 / Blackwell sm_120, per
# CHANGELOG 0.4.4 which uses `uv --torch-backend=cu128`):
#
#     RUN --mount=type=cache,target=/root/.cache/uv \
#         uv pip install --system --torch-backend=cu128 \
#             torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0
#
# or with an explicit index URL:
#
#     RUN uv pip install --system \
#         --index-url https://download.pytorch.org/whl/cu128 \
#         torch torchvision torchaudio
#
# CPU default (works without a GPU; SAM3 will report limited/CPU-only mode):
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system \
        --index-url https://download.pytorch.org/whl/cpu \
        torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0

# --- Python dependencies -------------------------------------------------------
# BuildKit cache mount speeds up rebuilds (uv wheel cache persists across builds).
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -r requirements.txt

# --- Application files ---------------------------------------------------------
# Copy the service entrypoint, the model downloader (imported lazily by main.py),
# and the BPE vocab asset required at main.py:561.
# NOTE: model_config.json is intentionally NOT copied, it is generated at
# runtime by download_models.py and main.py treats it as optional.
COPY main.py .
COPY download_models.py .
COPY assets/ ./assets/

# Model cache (mounted as a volume in production for persistence).
RUN mkdir -p models

# Run as a non-root user. python:3.11-slim has no app user, so create one and
# give it ownership of /app (including the models cache dir it writes to).
RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Default port (Railway overrides PORT; Railway internal services listen on 8080).
ENV PORT=8001
ENV PYTHONUNBUFFERED=1
EXPOSE 8001

# Health check (curl is installed above).
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the application.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}

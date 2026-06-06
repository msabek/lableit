#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Lableit inference setup for macOS / Apple Silicon (and Linux CPU).
#
# SAM3 is written for CUDA. This script provisions a Python environment that
# runs SAM3 on Apple Silicon (defaulting to CPU; MPS is opt-in and experimental)
# via the compatibility shims in apps/inference/_compat. It mirrors what run.bat
# does on Windows, adapted for macOS:
#   1. create a venv (Python 3.12)
#   2. install PyTorch (the default macOS wheel includes MPS)
#   3. install requirements.txt (sam3 is NOT in it — installed separately below)
#   4. install sam3 with --no-deps (its numpy<2 pin conflicts; triton has no mac build)
#   5. patch sam3 so its hard `import triton` becomes optional
#
# Usage:  cd apps/inference && bash setup_mac.sh
# Requires: uv (https://docs.astral.sh/uv/) and ffmpeg (brew install ffmpeg).
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"
PY_VERSION="${LABLEIT_PY_VERSION:-3.12}"
SAM3_COMMIT="c97c893969003d3e6803fd5d679f21e515aef5ce"

echo "==> Creating virtualenv (.venv, Python ${PY_VERSION})"
uv venv --python "${PY_VERSION}" .venv

echo "==> Installing PyTorch (macOS wheel includes MPS)"
uv pip install --python .venv/bin/python torch torchvision

echo "==> Installing inference requirements (excludes sam3)"
uv pip install --python .venv/bin/python -r requirements.txt

echo "==> Installing SAM3 (--no-deps; pinned ${SAM3_COMMIT})"
uv pip install --python .venv/bin/python --no-deps \
  "sam3 @ git+https://github.com/facebookresearch/sam3.git@${SAM3_COMMIT}"

echo "==> Patching SAM3 so 'import triton' is optional on this platform"
.venv/bin/python _compat/patch_sam3_triton.py

echo "==> Verifying SAM3 imports"
.venv/bin/python - <<'PYEOF'
import os
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
import sam3  # noqa: F401
from sam3.model_builder import build_sam3_image_model  # noqa: F401
import torch
print("OK — torch", torch.__version__,
      "| mps", torch.backends.mps.is_available(),
      "| default device: cpu (set LABLEIT_DEVICE=mps to try MPS)")
PYEOF

cat <<'EOF'

==> Done. Next steps:
  1. Download the SAM3 model (~2-4 GB):  .venv/bin/python download_models.py
  2. Run the inference service:
       .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8001
     (defaults to CPU on Apple Silicon; LABLEIT_DEVICE=mps for experimental Metal)
EOF

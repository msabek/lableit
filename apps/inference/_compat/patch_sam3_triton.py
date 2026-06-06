"""Make SAM3's hard ``import triton`` (in ``sam3/model/edt.py``) optional.

``triton`` has no build for macOS / Apple Silicon, but SAM3 imports it at module
load for a Euclidean-distance-transform GPU kernel used only by the interactive
video tracker (which also has a ``cv2.distanceTransform`` CPU fallback). This
patch rewrites only the two triton import lines into a guarded try/except with an
inline no-op fallback, so ``import sam3`` succeeds and image inference works.

- Idempotent (marker-guarded) and reversible (only touches 2 import lines).
- No-op when a real ``triton`` is installed (CUDA / Windows hosts), so it never
  changes those environments.

Run once after installing SAM3, e.g.:
    python _compat/patch_sam3_triton.py
"""

import importlib.util
import os
import sys

MARKER = "# LABLEIT_TRITON_OPTIONAL_PATCH"

TARGET = "import triton\nimport triton.language as tl"

FALLBACK = '''# LABLEIT_TRITON_OPTIONAL_PATCH (Lableit: make triton optional on non-GPU platforms)
try:
    import triton
    import triton.language as tl
except Exception:  # pragma: no cover - platforms without a triton build (e.g. macOS)
    def _lableit_jit(fn=None, **_kwargs):
        if fn is None:
            return lambda f: f
        return fn

    def _lableit_dec(*_a, **_k):
        return lambda f: f

    import types as _types
    triton = _types.SimpleNamespace(
        jit=_lableit_jit,
        autotune=_lableit_dec,
        heuristics=_lableit_dec,
        cdiv=lambda a, b: -(-a // b),
        Config=object,
    )

    class _LableitTL:
        class constexpr:  # used as a type annotation in kernel signatures
            def __init__(self, *_a, **_k):
                pass

        def __getattr__(self, name):
            def _unavailable(*_a, **_k):
                raise RuntimeError(
                    "triton.language.%s called, but triton is unavailable on this "
                    "platform. SAM3 image inference does not use triton kernels." % name
                )
            return _unavailable

    tl = _LableitTL()
'''


def main() -> int:
    try:
        import triton  # noqa: F401
        print("[patch_sam3_triton] real triton present; no patch needed.")
        return 0
    except Exception:
        pass

    spec = importlib.util.find_spec("sam3")
    if not spec or not spec.origin:
        print("[patch_sam3_triton] sam3 package not found.", file=sys.stderr)
        return 1
    edt = os.path.join(os.path.dirname(spec.origin), "model", "edt.py")
    if not os.path.isfile(edt):
        print(f"[patch_sam3_triton] edt.py not found at {edt}", file=sys.stderr)
        return 1

    with open(edt, encoding="utf-8") as f:
        src = f.read()

    if MARKER in src:
        print("[patch_sam3_triton] already patched.")
        return 0
    if TARGET not in src:
        print("[patch_sam3_triton] expected triton import block not found; skipping.",
              file=sys.stderr)
        return 0

    src = src.replace(TARGET, FALLBACK, 1)
    with open(edt, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"[patch_sam3_triton] patched {edt}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

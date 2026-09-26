"""Runtime compatibility shim that makes SAM3 (which is written for CUDA) run on
Apple Silicon (MPS) or CPU.

SAM3 hardcodes ``device="cuda"`` / ``.cuda()`` / ``torch.autocast("cuda")`` and
ships MIXED-dtype weights (mostly bf16, some fp32) that it reconciles at run time
with CUDA bf16 autocast. Off CUDA there is no equivalent, and several CPU/MPS ops
either lack bf16 support or reject mixed-dtype matmuls. So this shim:

  * redirects ``.cuda()`` / ``device="cuda"`` to the active device, and
  * forces every float tensor to ``float32`` (model weights are cast separately by
    the caller), neutralizing SAM3's explicit ``.bfloat16()`` / ``.half()`` casts,
  * turns SAM3's hardcoded cuda autocast into a no-op (pure fp32).

The result is a single, consistent float32 path that every CPU/MPS op supports.
This is a NO-OP when the device is "cuda", so CUDA / Windows hosts are unaffected.

Call ``enable("mps")`` or ``enable("cpu")`` once, before building/using the model.
"""

from contextlib import nullcontext

import torch

_ENABLED = False


def enable(device: str) -> None:
    global _ENABLED
    if _ENABLED or device == "cuda":
        return
    _ENABLED = True
    target = torch.device(device)
    fp32 = torch.float32
    half_types = (torch.bfloat16, torch.float16)

    def _fix(args, kwargs):
        """Remap any cuda device -> target and any bf16/half dtype -> float32."""
        if "device" in kwargs:
            kwargs["device"] = _remap_device(kwargs["device"], device, target)
        if "dtype" in kwargs and kwargs["dtype"] in half_types:
            kwargs["dtype"] = fp32
        new_args = []
        for a in args:
            if isinstance(a, str) and a.startswith("cuda"):
                new_args.append(device)
            elif isinstance(a, torch.device) and a.type == "cuda":
                new_args.append(target)
            elif isinstance(a, torch.dtype) and a in half_types:
                new_args.append(fp32)
            else:
                new_args.append(a)
        return tuple(new_args), kwargs

    # 1) .cuda() -> .to(target); .bfloat16()/.half() -> float32 (force single dtype)
    torch.Tensor.cuda = lambda self, *a, **k: self.to(target)  # type: ignore[assignment]
    torch.nn.Module.cuda = lambda self, *a, **k: self.to(target)  # type: ignore[assignment]
    torch.Tensor.bfloat16 = lambda self, *a, **k: self.to(fp32)  # type: ignore[assignment]
    torch.Tensor.half = lambda self, *a, **k: self.to(fp32)  # type: ignore[assignment]
    torch.nn.Module.bfloat16 = lambda self, *a, **k: self.to(fp32)  # type: ignore[assignment]
    torch.nn.Module.half = lambda self, *a, **k: self.to(fp32)  # type: ignore[assignment]

    # pin_memory() pins to the current accelerator; with MPS present it returns an
    # mps-pinned tensor, which then breaks a subsequent .to("cpu"). Pinned memory is
    # a CUDA-only optimization, so make it a no-op off CUDA.
    torch.Tensor.pin_memory = lambda self, *a, **k: self  # type: ignore[assignment]

    # 2) Tensor.to / Module.to -> remap cuda device + bf16/half dtype
    _orig_to = torch.Tensor.to

    def _to(self, *args, **kwargs):
        args, kwargs = _fix(args, kwargs)
        return _orig_to(self, *args, **kwargs)

    torch.Tensor.to = _to  # type: ignore[assignment]

    _orig_mod_to = torch.nn.Module.to

    def _mod_to(self, *args, **kwargs):
        args, kwargs = _fix(args, kwargs)
        return _orig_mod_to(self, *args, **kwargs)

    torch.nn.Module.to = _mod_to  # type: ignore[assignment]

    # 3) Tensor factory functions: remap device="cuda" + bf16/half dtype
    for name in (
        "zeros", "ones", "empty", "full", "arange", "tensor", "as_tensor",
        "randn", "rand", "randint", "zeros_like", "ones_like", "empty_like",
        "full_like", "linspace", "eye",
    ):
        orig = getattr(torch, name, None)
        if orig is None:
            continue
        setattr(torch, name, _wrap_factory(orig, _fix))

    # 4) autocast: SAM3 hardcodes device_type="cuda" -> no-op off CUDA (pure fp32).
    _orig_autocast = torch.autocast

    class _AutocastShim:
        def __init__(self, device_type="cuda", *a, **k):
            if device_type == "cuda":
                self._ctx = nullcontext()
            else:
                self._ctx = _orig_autocast(device_type, *a, **k)

        def __enter__(self):
            return self._ctx.__enter__()

        def __exit__(self, *exc):
            return self._ctx.__exit__(*exc)

        def __call__(self, func):
            def wrapper(*a, **k):
                with self:
                    return func(*a, **k)
            return wrapper

    torch.autocast = _AutocastShim  # type: ignore[assignment]
    if hasattr(torch, "amp"):
        torch.amp.autocast = _AutocastShim  # type: ignore[assignment]
    if hasattr(torch, "cuda") and hasattr(torch.cuda, "amp"):
        torch.cuda.amp.autocast = _AutocastShim  # type: ignore[assignment]


def _remap_device(d, device_str, target):
    if isinstance(d, str) and d.startswith("cuda"):
        return device_str
    if isinstance(d, torch.device) and d.type == "cuda":
        return target
    return d


def _wrap_factory(orig, fix):
    def wrapped(*args, **kwargs):
        args, kwargs = fix(args, kwargs)
        return orig(*args, **kwargs)
    return wrapped

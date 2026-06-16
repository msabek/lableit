"""
Lableit Inference Service
SAM3 (Segment Anything Model 3) integration for image segmentation
Supports text-prompt based object detection and segmentation
"""

# Enable CPU fallback for any op Metal (Apple Silicon / MPS) does not implement.
# Must be set before torch initializes the MPS backend. Harmless on CUDA/Windows
# hosts (no MPS backend), so this is safe cross-platform.
import os
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Tuple, Union
from contextlib import asynccontextmanager, nullcontext
import torch
import numpy as np
import requests
from io import BytesIO
from PIL import Image
import base64
import os
import logging
import time
import cv2
import json
import threading
import re
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ================================
# Configuration
# ================================
# Device selection priority: CUDA (NVIDIA) > MPS (Apple Silicon) > CPU.
# An explicit override is supported via LABLEIT_DEVICE=cuda|mps|cpu.
CUDA_AVAILABLE = torch.cuda.is_available()
MPS_AVAILABLE = bool(getattr(torch.backends, "mps", None)) and torch.backends.mps.is_available()
_forced_device = os.environ.get("LABLEIT_DEVICE", "").strip().lower()

if _forced_device in ("cuda", "mps", "cpu"):
    DEVICE = _forced_device
elif CUDA_AVAILABLE:
    DEVICE = "cuda"
elif MPS_AVAILABLE:
    # Apple Silicon: automatically use the Metal (MPS) GPU. A few SAM3 ops are not
    # implemented on MPS and fall back to CPU (PYTORCH_ENABLE_MPS_FALLBACK=1), so
    # MPS does not always beat CPU for SAM3 — but this honors "detect the hardware
    # and use the available GPU". Force CPU instead with LABLEIT_DEVICE=cpu.
    DEVICE = "mps"
else:
    DEVICE = "cpu"

# Verify CUDA GPU architecture is actually supported by this PyTorch build
# (catches sm_120 Blackwell GPUs with older PyTorch that only supports up to sm_90)
if DEVICE == "cuda":
    try:
        _test = torch.zeros(1, device='cuda')
        del _test
    except RuntimeError as e:
        logging.getLogger(__name__).warning(f"CUDA available but GPU incompatible with this PyTorch build: {e}")
        logging.getLogger(__name__).warning("Falling back to MPS/CPU. Install PyTorch with cu128 for Blackwell GPUs (RTX 50-series).")
        CUDA_AVAILABLE = False
        DEVICE = "mps" if MPS_AVAILABLE else "cpu"

# Verify MPS is actually usable (rare driver/build mismatches)
if DEVICE == "mps":
    try:
        _test = torch.zeros(1, device='mps')
        del _test
    except Exception as e:
        logging.getLogger(__name__).warning(f"MPS reported available but unusable ({e}); falling back to CPU.")
        DEVICE = "cpu"

# Export the resolved device so the optional SAM3 device patch (patch_sam3_device.py)
# can redirect SAM3's hardcoded device="cuda" tensors to the real device.
os.environ.setdefault("SAM3_DEVICE", DEVICE)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# On non-CUDA devices (Apple Silicon MPS / CPU), redirect SAM3's many hardcoded
# CUDA tensor ops to the active device. No-op on CUDA, so Windows/Linux GPU hosts
# are unaffected. Must run before any SAM3 model is built.
if DEVICE != "cuda":
    try:
        import sys as _sys
        if SCRIPT_DIR not in _sys.path:
            _sys.path.insert(0, SCRIPT_DIR)
        from _compat.torch_device_compat import enable as _enable_device_compat
        _enable_device_compat(DEVICE)
        logger.info(f"Enabled torch device-compat shim (CUDA-hardcoded ops -> {DEVICE}).")
    except Exception as _compat_err:
        logger.warning(f"Could not enable torch device-compat shim: {_compat_err}")

MODEL_CACHE_DIR = os.environ.get('MODEL_CACHE_DIR', os.path.join(SCRIPT_DIR, 'models'))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "model_config.json")
SETTINGS_FILE = os.path.join(SCRIPT_DIR, "settings.json")
MODEL_LOAD_RETRY_COOLDOWN_SECONDS = int(os.environ.get("MODEL_LOAD_RETRY_COOLDOWN_SECONDS", "120"))

# SAM3 can run on CUDA (NVIDIA), MPS (Apple Silicon), or CPU. On non-CUDA devices
# the SAM3 library hardcodes device="cuda" in a few spots (e.g. position_encoding.py);
# patch_sam3_device.py rewrites those to honor SAM3_DEVICE, and PYTORCH_ENABLE_MPS_FALLBACK
# covers any op Metal lacks. CPU works but is slow; MPS is recommended on Apple Silicon.
SAM3_AVAILABLE = DEVICE in ("cuda", "mps", "cpu")

# ================================
# Security / Network Configuration
# ================================
# SECURITY NOTICE:
#   This inference service has NO built-in authentication beyond the OPTIONAL
#   shared-secret check below. It is intended to run on a PRIVATE network,
#   reachable ONLY by the Lableit API service (server-to-server). It MUST NOT be
#   exposed directly to the public internet. On Railway, bind it to the internal
#   network (services listen on :8080) and never assign it a public domain.
#
#   Two optional environment variables harden the deployment without changing
#   the default behaviour:
#     - INFERENCE_ALLOWED_ORIGINS: comma-separated CORS allow-list (default '*').
#       Cookies/credentials are never used, so allow_credentials is False.
#     - INFERENCE_SHARED_SECRET: if set, every mutating/inference request must
#       carry a matching `X-Inference-Secret` header. If unset (the default),
#       the check is skipped for full backward compatibility.

# CORS allow-list. Comma-separated origins, e.g. "https://app.example.com".
# Defaults to '*' to preserve existing behaviour for private-network deployments.
_raw_allowed_origins = os.environ.get("INFERENCE_ALLOWED_ORIGINS", "*").strip()
if _raw_allowed_origins == "*" or not _raw_allowed_origins:
    INFERENCE_ALLOWED_ORIGINS = ["*"]
else:
    INFERENCE_ALLOWED_ORIGINS = [
        origin.strip() for origin in _raw_allowed_origins.split(",") if origin.strip()
    ]

# Optional shared secret. When set, requests must send a matching
# `X-Inference-Secret` header. When unset, the check is skipped (default).
INFERENCE_SHARED_SECRET = os.environ.get("INFERENCE_SHARED_SECRET", "").strip()

# Upload limits for the /infer/upload endpoint (input validation).
MAX_UPLOAD_BYTES = int(os.environ.get("INFERENCE_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
MAX_PROMPTS = int(os.environ.get("INFERENCE_MAX_PROMPTS", "50"))

# Optional mixed-precision (bfloat16 autocast) for inference. OFF by default so
# default detection output is unchanged; only enable to trade tiny numeric
# differences for speed/memory on CUDA.
INFERENCE_USE_AUTOCAST = os.environ.get("INFERENCE_USE_AUTOCAST", "").strip().lower() in (
    "1", "true", "yes", "on"
)

os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

logger.info(f"Using device: {DEVICE}")
logger.info(f"CUDA available: {CUDA_AVAILABLE}")
if DEVICE == "cuda":
    logger.info(f"CUDA device: {torch.cuda.get_device_name(0)}")
    # Enable TF32 for better performance on Ampere GPUs
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
elif DEVICE == "mps":
    logger.info("Using Apple Silicon GPU (Metal / MPS). Unsupported ops fall back to CPU.")
else:
    logger.warning("=" * 60)
    logger.warning("WARNING: No GPU detected (no CUDA or MPS).")
    logger.warning("SAM3 will run on CPU, which is significantly slower and memory-heavy.")
    logger.warning("Manual annotation features always work in the frontend regardless.")
    logger.warning("=" * 60)

# ================================
# Global State
# ================================
class ModelState:
    """Thread-safe model state management"""
    def __init__(self):
        self.model = None
        self.processor = None
        self.loaded = False
        self.load_error: Optional[str] = None
        self.load_time: Optional[datetime] = None
        self.last_inference: Optional[datetime] = None
        self.inference_count: int = 0
        self.last_load_attempt: Optional[datetime] = None
        self.retry_after: Optional[datetime] = None
        self._lock = threading.Lock()
    
    def set_loaded(self, model, processor):
        with self._lock:
            self.model = model
            self.processor = processor
            self.loaded = True
            self.load_error = None
            self.load_time = datetime.now()
            self.retry_after = None

    def set_error(self, error: str, cooldown_seconds: int = 0):
        with self._lock:
            self.model = None
            self.processor = None
            self.loaded = False
            self.load_error = error
            if cooldown_seconds > 0:
                self.retry_after = datetime.fromtimestamp(time.time() + cooldown_seconds)
            else:
                self.retry_after = None

    def unload(self):
        with self._lock:
            if self.model is not None:
                del self.model
            if self.processor is not None:
                del self.processor
            self.model = None
            self.processor = None
            self.loaded = False
            self.load_error = None
            self.retry_after = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    
    def record_inference(self):
        with self._lock:
            self.last_inference = datetime.now()
            self.inference_count += 1
    
    def get_status(self) -> dict:
        with self._lock:
            return {
                "loaded": self.loaded,
                "load_error": self.load_error,
                "load_time": self.load_time.isoformat() if self.load_time else None,
                "last_load_attempt": self.last_load_attempt.isoformat() if self.last_load_attempt else None,
                "retry_after": self.retry_after.isoformat() if self.retry_after else None,
                "last_inference": self.last_inference.isoformat() if self.last_inference else None,
                "inference_count": self.inference_count,
                "gpu_available": SAM3_AVAILABLE,
                "gpu_required": True,
                "device": DEVICE
            }

model_state = ModelState()

# Download state for progress tracking
download_state = {
    "in_progress": False,
    "progress": 0,
    "status": "idle",
    "error": None,
    "started_at": None,
    "completed_at": None,
    "bytes_downloaded": 0,
    "total_bytes": 0
}

# ================================
# Settings Management
# ================================
DEFAULT_SETTINGS = {
    "preload_on_startup": True,
    "default_confidence_threshold": 0.5,
    "inference_timeout_seconds": 60,
    "max_image_size": 4096,
    "return_masks_by_default": True
}

def load_settings() -> dict:
    """Load settings from file or return defaults"""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                saved = json.load(f)
                return {**DEFAULT_SETTINGS, **saved}
        except Exception as e:
            logger.warning(f"Failed to load settings: {e}")
    return DEFAULT_SETTINGS.copy()

def save_settings(settings: dict):
    """Save settings to file"""
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")

# ================================
# Request/Response Models
# ================================
class TextPromptRequest(BaseModel):
    """Request for text-prompt based segmentation"""
    image_url: Optional[str] = None
    image_base64: Optional[str] = None
    prompts: List[str] = Field(..., description="List of text prompts like ['person', 'car', 'dog']")
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    return_masks: bool = True
    return_boxes: bool = True
    # Accuracy improvement options
    iou_threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="IoU threshold for NMS duplicate removal")
    min_box_area: int = Field(default=100, ge=0, description="Minimum box area in pixels (filter tiny detections)")
    max_detections_per_class: int = Field(default=100, ge=1, le=500, description="Maximum detections per class")


class PointPromptRequest(BaseModel):
    """Request for point/box prompt based segmentation"""
    image_url: Optional[str] = None
    image_base64: Optional[str] = None
    points: Optional[List[List[float]]] = None
    point_labels: Optional[List[bool]] = None
    boxes: Optional[List[List[float]]] = None
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)


class ConfigUpdate(BaseModel):
    """Configuration update request"""
    model_path: Optional[str] = None
    device: Optional[str] = None


class SettingsUpdate(BaseModel):
    """Settings update request"""
    preload_on_startup: Optional[bool] = None
    default_confidence_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    inference_timeout_seconds: Optional[int] = Field(default=None, ge=10, le=300)
    max_image_size: Optional[int] = Field(default=None, ge=512, le=8192)
    return_masks_by_default: Optional[bool] = None


class Detection(BaseModel):
    """Single detection result"""
    class_name: str
    confidence: float
    box: List[float]
    mask_rle: Optional[str] = None
    mask_polygon: Optional[List[List[float]]] = None
    area: Optional[int] = None


class InferenceResponse(BaseModel):
    """Response containing all detections"""
    detections: List[Detection]
    image_width: int
    image_height: int
    processing_time_ms: float


class ModelInfo(BaseModel):
    """Model information"""
    id: str
    name: str
    loaded: bool
    device: str
    supports_text_prompts: bool


# ================================
# RLE Encoding/Decoding
# ================================
def mask_to_rle(mask: np.ndarray) -> str:
    """Convert binary mask to RLE string (COCO format)"""
    pixels = mask.flatten()
    pixels = np.concatenate([[0], pixels, [0]])
    runs = np.where(pixels[1:] != pixels[:-1])[0] + 1
    runs[1::2] -= runs[::2]
    return ','.join(str(x) for x in runs)


def mask_to_polygon(mask: np.ndarray, simplify: bool = True) -> List[List[float]]:
    """Convert binary mask to polygon points"""
    contours, _ = cv2.findContours(
        mask.astype(np.uint8),
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )
    if not contours:
        return []
    
    largest = max(contours, key=cv2.contourArea)
    
    if simplify:
        epsilon = 0.01 * cv2.arcLength(largest, True)
        largest = cv2.approxPolyDP(largest, epsilon, True)
    
    points = largest.reshape(-1, 2).tolist()
    return points


def compute_iou(box1: List[float], box2: List[float]) -> float:
    """Compute IoU between two boxes [x1, y1, x2, y2]"""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    
    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - intersection
    
    return intersection / union if union > 0 else 0


def apply_nms(detections: List['Detection'], iou_threshold: float = 0.5) -> List['Detection']:
    """Apply Non-Maximum Suppression to remove overlapping detections"""
    if len(detections) <= 1:
        return detections
    
    # Sort by confidence (highest first)
    sorted_dets = sorted(detections, key=lambda d: d.confidence, reverse=True)
    
    keep = []
    while sorted_dets:
        best = sorted_dets.pop(0)
        keep.append(best)
        
        # Remove detections with high IoU overlap with the best detection
        sorted_dets = [
            det for det in sorted_dets
            if compute_iou(best.box, det.box) < iou_threshold
        ]
    
    return keep


def filter_detections(
    detections: List['Detection'],
    min_box_area: int = 100,
    max_detections_per_class: int = 100,
    iou_threshold: float = 0.5
) -> List['Detection']:
    """Apply filtering and NMS to improve detection quality"""
    # Filter by minimum box area
    filtered = []
    for det in detections:
        box = det.box
        area = (box[2] - box[0]) * (box[3] - box[1])
        if area >= min_box_area:
            filtered.append(det)
    
    # Group by class and apply NMS per class
    by_class: dict = {}
    for det in filtered:
        if det.class_name not in by_class:
            by_class[det.class_name] = []
        by_class[det.class_name].append(det)
    
    result = []
    for class_name, class_dets in by_class.items():
        # Apply NMS within each class
        nms_dets = apply_nms(class_dets, iou_threshold)
        # Limit detections per class
        result.extend(nms_dets[:max_detections_per_class])
    
    return result


def get_bbox_from_mask(mask: np.ndarray) -> List[float]:
    """Get bounding box [x1, y1, x2, y2] from binary mask"""
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any() or not cols.any():
        return [0, 0, 0, 0]
    
    y1, y2 = np.where(rows)[0][[0, -1]]
    x1, x2 = np.where(cols)[0][[0, -1]]
    return [float(x1), float(y1), float(x2 + 1), float(y2 + 1)]


# ================================
# Security Dependency
# ================================
def require_shared_secret(x_inference_secret: Optional[str] = Header(default=None)):
    """Optional shared-secret guard for mutating/inference endpoints.

    If INFERENCE_SHARED_SECRET is set, the request must carry a matching
    `X-Inference-Secret` header. If it is unset (the default), the check is
    skipped so existing callers continue to work unchanged.
    """
    if not INFERENCE_SHARED_SECRET:
        return
    if x_inference_secret != INFERENCE_SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Inference-Secret header")


# ================================
# Image Processing
# ================================
# Reuse a single Session across requests for HTTP keep-alive / connection pooling
# instead of creating a fresh connection on every image download.
_http_session = requests.Session()


def load_image_from_url(url: str, timeout: int = 30) -> Image.Image:
    """Download and load image from URL"""
    try:
        response = _http_session.get(url, timeout=timeout)
        response.raise_for_status()
        return Image.open(BytesIO(response.content)).convert("RGB")
    except requests.Timeout:
        raise HTTPException(status_code=408, detail=f"Image download timed out after {timeout}s")
    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to download image: {str(e)}")
    except Exception as e:
        logger.error(f"Failed to load image from URL {url}: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to load image: {str(e)}")


def load_image_from_base64(base64_str: str) -> Image.Image:
    """Load image from base64 string"""
    try:
        if ',' in base64_str:
            base64_str = base64_str.split(',')[1]
        image_data = base64.b64decode(base64_str)
        return Image.open(BytesIO(image_data)).convert("RGB")
    except Exception as e:
        logger.error(f"Failed to decode base64 image: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {str(e)}")


def get_image(image_url: Optional[str], image_base64: Optional[str]) -> Image.Image:
    """Get image from either URL or base64"""
    if image_url:
        return load_image_from_url(image_url)
    elif image_base64:
        return load_image_from_base64(image_base64)
    else:
        raise HTTPException(status_code=400, detail="Either image_url or image_base64 is required")


def downscale_image_for_inference(image: Image.Image) -> Tuple[Image.Image, float]:
    """Honor the configured max_image_size by downscaling oversized images.

    Returns (image_for_inference, scale) where `scale` is the factor that maps
    inference-space coordinates back to the ORIGINAL image (>= 1.0). When the
    image is already within the cap (the common case), the original image is
    returned unchanged with scale == 1.0, so default output is identical.

    Detection boxes/masks produced on the downscaled image are scaled back to
    original coordinates by the callers, keeping the response in the original
    image's coordinate space.
    """
    try:
        cap = int(load_settings().get("max_image_size", DEFAULT_SETTINGS["max_image_size"]))
    except Exception:
        cap = DEFAULT_SETTINGS["max_image_size"]

    if cap <= 0:
        return image, 1.0

    width, height = image.size
    longest = max(width, height)
    if longest <= cap:
        return image, 1.0

    # PIL's thumbnail preserves aspect ratio and only ever shrinks.
    resized = image.copy()
    resized.thumbnail((cap, cap), Image.LANCZOS)
    new_longest = max(resized.size)
    if new_longest <= 0:
        return image, 1.0
    scale = longest / new_longest
    logger.info(
        f"Downscaled image from {width}x{height} to {resized.size[0]}x{resized.size[1]} "
        f"(cap={cap}); boxes/masks will be scaled back by {scale:.4f}"
    )
    return resized, scale


def _autocast_ctx():
    """Return a bfloat16 autocast context on CUDA when explicitly enabled.

    Default behaviour (env unset) is a no-op context, so detection output is
    identical to before. Only activates when INFERENCE_USE_AUTOCAST is set and a
    CUDA device is in use.
    """
    if INFERENCE_USE_AUTOCAST and CUDA_AVAILABLE:
        return torch.autocast(device_type="cuda", dtype=torch.bfloat16)
    return nullcontext()


def _rescale_box(box: List[float], scale: float) -> List[float]:
    """Scale a [x0, y0, x1, y1] box from inference space back to original space."""
    if scale == 1.0:
        return box
    return [coord * scale for coord in box]


def _rescale_mask(mask_binary: np.ndarray, target_width: int, target_height: int) -> np.ndarray:
    """Resize a binary mask back to original image dimensions (nearest neighbor).

    No-op when the mask already matches the target size (the default, un-downscaled
    case), keeping output identical.
    """
    h, w = mask_binary.shape[:2]
    if w == target_width and h == target_height:
        return mask_binary
    resized = cv2.resize(
        mask_binary.astype(np.uint8),
        (target_width, target_height),
        interpolation=cv2.INTER_NEAREST,
    )
    return (resized > 0).astype(np.uint8)


# ================================
# SAM3 Model Loading
# ================================
def get_model_config() -> dict:
    """Read model configuration file"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                config = json.load(f)

            changed = False
            marker_pattern = re.compile(r"apps[\\/]+inference[\\/]+(.+)", re.IGNORECASE)
            for key in ("model_path", "base_dir"):
                raw_path = config.get(key)
                if not isinstance(raw_path, str) or not raw_path:
                    continue
                normalized = os.path.normpath(raw_path)
                if os.path.exists(normalized):
                    continue
                match = marker_pattern.search(normalized)
                if not match:
                    continue
                candidate = os.path.normpath(os.path.join(SCRIPT_DIR, match.group(1)))
                if key == "model_path" or os.path.exists(candidate):
                    logger.info(f"Resolved stale config path for {key}: {raw_path} -> {candidate}")
                    config[key] = candidate
                    changed = True

            if changed:
                try:
                    with open(CONFIG_FILE, "w") as f:
                        json.dump(config, f, indent=2)
                except Exception as e:
                    logger.warning(f"Failed to persist corrected model config: {e}")
            return config
        except Exception as e:
            logger.warning(f"Failed to read model config: {e}")
    return {}


def check_sam3_installation() -> Tuple[bool, str]:
    """Check if SAM3 is properly installed and return import info"""
    try:
        # Try primary import path
        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor
        return True, "sam3.model_builder"
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"SAM3 primary import failed (non-ImportError): {e}")
        return False, f"SAM3 import error: {e}"

    try:
        # Try alternative import path
        from sam3 import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor
        return True, "sam3"
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"SAM3 alternative import failed (non-ImportError): {e}")
        return False, f"SAM3 import error: {e}"

    return False, "SAM3 library not found. Install with: pip install sam3>=0.1.2"


def validate_checkpoint(checkpoint_path: str) -> Tuple[bool, str]:
    """Validate that checkpoint file exists and is valid"""
    if not checkpoint_path:
        return False, "No checkpoint path provided"
    
    if not os.path.exists(checkpoint_path):
        return False, f"Checkpoint file not found: {checkpoint_path}"
    
    # Check file size (should be > 100MB for a real model)
    file_size = os.path.getsize(checkpoint_path)
    if file_size < 100 * 1024 * 1024:  # Less than 100MB
        return False, f"Checkpoint file too small ({file_size / 1024 / 1024:.1f}MB), may be corrupted"
    
    return True, f"Checkpoint valid ({file_size / 1024 / 1024:.1f}MB)"


def load_sam3_model(force: bool = False) -> Union[bool, str]:
    """
    Load SAM3 model with robust error handling.
    Returns True on success, or error message string on failure.
    """
    global model_state

    if model_state.loaded:
        logger.info("SAM3 model already loaded")
        return True

    # Avoid repeatedly hammering remote model sources after a known failure.
    if (
        not force
        and model_state.load_error
        and model_state.retry_after
        and datetime.now() < model_state.retry_after
    ):
        retry_at = model_state.retry_after.strftime("%Y-%m-%d %H:%M:%S")
        return f"{model_state.load_error} (retry blocked until {retry_at}; call /models/sam3/load to force retry)"

    model_state.last_load_attempt = datetime.now()

    # SAM3 runs on CUDA (NVIDIA), MPS (Apple Silicon), or CPU. SAM3_AVAILABLE is
    # only false if no usable torch device resolved at all.
    if not SAM3_AVAILABLE:
        error_msg = "No usable compute device for SAM3 (CUDA, MPS, or CPU). Check the PyTorch installation."
        logger.error(error_msg)
        model_state.set_error(error_msg, cooldown_seconds=MODEL_LOAD_RETRY_COOLDOWN_SECONDS)
        return error_msg
    
    logger.info("=" * 50)
    logger.info("Starting SAM3 model loading...")
    logger.info("=" * 50)
    
    # Step 1: Check SAM3 installation
    installed, import_path = check_sam3_installation()
    if not installed:
        error_msg = import_path
        logger.error(error_msg)
        model_state.set_error(error_msg, cooldown_seconds=MODEL_LOAD_RETRY_COOLDOWN_SECONDS)
        return error_msg
    
    logger.info(f"SAM3 found via: {import_path}")
    
    # Step 2: Import SAM3 modules
    try:
        if import_path == "sam3.model_builder":
            from sam3.model_builder import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor
        else:
            from sam3 import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor
    except ImportError as e:
        error_msg = f"Failed to import SAM3 modules: {e}"
        logger.error(error_msg)
        model_state.set_error(error_msg, cooldown_seconds=MODEL_LOAD_RETRY_COOLDOWN_SECONDS)
        return error_msg
    
    # Step 3: Check for local checkpoint
    config = get_model_config()
    checkpoint_path = config.get("model_path")
    
    # BPE Path
    bpe_path = os.path.join(SCRIPT_DIR, "assets", "bpe_simple_vocab_16e6.txt.gz")
    if not os.path.exists(bpe_path):
        logger.warning(f"BPE file not found at {bpe_path}, trying default location...")
        bpe_path = None # Let it fallback or fail if still missing

    if checkpoint_path:
        valid, msg = validate_checkpoint(checkpoint_path)
        if valid:
            logger.info(f"Using local checkpoint: {checkpoint_path}")
            logger.info(msg)
        else:
            logger.warning(f"Local checkpoint invalid: {msg}")
            checkpoint_path = None
    
    # Step 4: Build the model
    try:
        logger.info(f"Building SAM3 model on device: {DEVICE}")
        
        if checkpoint_path:
            # Try with explicit checkpoint path
            try:
                sam3_model = build_sam3_image_model(checkpoint_path=checkpoint_path, bpe_path=bpe_path)
                logger.info("Model built with local checkpoint")
            except TypeError:
                # Function doesn't accept checkpoint_path arg (older version?)
                logger.warning("build_sam3_image_model doesn't accept checkpoint_path arg, using default")
                sam3_model = build_sam3_image_model(bpe_path=bpe_path)
        else:
            # Use default (may download from HuggingFace)
            logger.info("Building model with default configuration...")
            sam3_model = build_sam3_image_model(bpe_path=bpe_path)
        
        # SAM3 ships MIXED-dtype weights (most modules bf16, some fp32) and relies
        # on CUDA bf16 autocast to reconcile dtypes at run time. Off CUDA there is no
        # equivalent, so on non-CUDA devices we run the whole model in float32: the
        # device-compat shim also forces SAM3's explicit bf16/half casts to float32,
        # giving a single consistent dtype that every CPU/MPS op supports. CUDA keeps
        # its native dtype and bf16 autocast for performance.
        if DEVICE != "cuda":
            sam3_model = sam3_model.float()
        sam3_model.to(DEVICE)
        sam3_model.eval()
        logger.info(f"Model moved to {DEVICE} (float32 unified: {DEVICE != 'cuda'})")
        
        # Step 5: Initialize processor
        sam3_processor = Sam3Processor(sam3_model)
        logger.info("Sam3Processor initialized")
        
        # Step 6: Validate model by running a quick test
        logger.info("Validating model with test inference...")
        try:
            # Create a small test image
            test_image = Image.new('RGB', (64, 64), color='red')
            test_state = sam3_processor.set_image(test_image)
            logger.info("Model validation successful!")
        except Exception as e:
            logger.warning(f"Model validation warning (non-fatal): {e}")
        
        # Success!
        model_state.set_loaded(sam3_model, sam3_processor)
        logger.info("=" * 50)
        logger.info("[SUCCESS] SAM3 model loaded and ready!")
        logger.info("=" * 50)
        return True
        
    except Exception as e:
        error_msg = f"Failed to build SAM3 model: {str(e)}"
        logger.error(error_msg)
        import traceback
        traceback.print_exc()
        model_state.set_error(error_msg, cooldown_seconds=MODEL_LOAD_RETRY_COOLDOWN_SECONDS)
        return error_msg


def unload_sam3_model() -> bool:
    """Unload SAM3 model to free memory"""
    global model_state
    model_state.unload()
    logger.info("SAM3 model unloaded")
    return True


# ================================
# Inference Functions
# ================================
@torch.inference_mode()
def run_text_prompt_inference(
    image: Image.Image,
    prompts: List[str],
    confidence_threshold: float = 0.5,
    return_masks: bool = True,
    return_boxes: bool = True,
    iou_threshold: float = 0.5,
    min_box_area: int = 100,
    max_detections_per_class: int = 100
) -> Tuple[List[Detection], int, int]:
    """Run SAM3 inference with text prompts.

    SAM3's API works as follows:
    1. set_image(image) -> returns state with image embeddings
    2. set_confidence_threshold(threshold) -> sets minimum confidence
    3. set_text_prompt(prompt, state) -> runs inference and returns state with:
       - state["masks"] - binary masks tensor
       - state["boxes"] - bounding boxes tensor [x0, y0, x1, y1]
       - state["scores"] - confidence scores tensor

    Accuracy improvements:
    - iou_threshold: IoU threshold for NMS to remove duplicate detections
    - min_box_area: Minimum box area in pixels to filter tiny/noise detections
    - max_detections_per_class: Maximum detections per class to prevent over-detection
    """
    global model_state

    if not model_state.loaded or model_state.processor is None:
        result = load_sam3_model()
        if result is not True:
            raise HTTPException(status_code=503, detail=f"SAM3 model not available: {result}")

    # Check GPU memory before inference
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated(0) / (1024**3)
        total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        if allocated > 0.85 * total:
            logger.warning(f"GPU memory high ({allocated:.1f}GB/{total:.1f}GB), clearing cache...")
            torch.cuda.empty_cache()

    # Report results in the ORIGINAL image coordinate space.
    width, height = image.size
    # Honor max_image_size: oversized images are downscaled for inference, then
    # boxes/masks are scaled back so the response is unchanged at the cap.
    inference_image, scale = downscale_image_for_inference(image)
    detections = []

    try:
        # Initialize image state (optionally under bfloat16 autocast on CUDA).
        with _autocast_ctx():
            inference_state = model_state.processor.set_image(inference_image)

            # Set the minimum confidence threshold for faster filtering
            model_state.processor.set_confidence_threshold(confidence_threshold)

            for prompt in prompts:
                prompt = prompt.strip()
                if not prompt:
                    continue

                logger.info(f"Processing text prompt: '{prompt}'")

                # Run inference - results are embedded in the returned state
                result_state = model_state.processor.set_text_prompt(prompt, inference_state)

                # Extract results from state
                masks = result_state.get("masks")
                boxes = result_state.get("boxes")
                scores = result_state.get("scores")

                if scores is None or len(scores) == 0:
                    logger.info(f"No detections for prompt: '{prompt}'")
                    continue

                # Convert tensors to numpy for processing
                if isinstance(scores, torch.Tensor):
                    scores = scores.cpu().numpy()
                if isinstance(boxes, torch.Tensor):
                    boxes = boxes.cpu().numpy()
                if isinstance(masks, torch.Tensor):
                    masks = masks.cpu().numpy()

                # Process each detection
                num_detections = len(scores)
                logger.info(f"Found {num_detections} detections for prompt: '{prompt}'")

                for i in range(num_detections):
                    confidence = float(scores[i])

                    # Apply per-detection threshold check (already filtered by processor)
                    if confidence < confidence_threshold:
                        continue

                    # Get bounding box [x0, y0, x1, y1] (scaled back to original coords)
                    box = [0.0, 0.0, 0.0, 0.0]
                    if boxes is not None and i < len(boxes):
                        box_data = boxes[i]
                        if len(box_data) >= 4:
                            box = _rescale_box(
                                [float(box_data[0]), float(box_data[1]),
                                 float(box_data[2]), float(box_data[3])],
                                scale
                            )

                    detection = Detection(
                        class_name=prompt,
                        confidence=confidence,
                        box=box
                    )

                    # Process mask if available
                    if masks is not None and i < len(masks):
                        mask = masks[i]
                        # Squeeze extra dimensions (masks might be [1, H, W] or [H, W])
                        while mask.ndim > 2:
                            mask = mask.squeeze(0)

                        mask_binary = (mask > 0.5).astype(np.uint8)
                        # Scale mask back to original image dimensions (no-op at scale 1.0)
                        mask_binary = _rescale_mask(mask_binary, width, height)
                        detection.area = int(mask_binary.sum())

                        # If box is empty, compute from mask
                        if detection.box == [0.0, 0.0, 0.0, 0.0]:
                            detection.box = get_bbox_from_mask(mask_binary)

                        if return_masks:
                            detection.mask_rle = mask_to_rle(mask_binary)
                            detection.mask_polygon = mask_to_polygon(mask_binary)

                    detections.append(detection)

                # Reset prompts for next iteration to avoid accumulation
                model_state.processor.reset_all_prompts(inference_state)

        model_state.record_inference()
        
        # Apply post-processing filters for improved accuracy
        if detections:
            original_count = len(detections)
            detections = filter_detections(
                detections,
                min_box_area=min_box_area,
                max_detections_per_class=max_detections_per_class,
                iou_threshold=iou_threshold
            )
            filtered_count = len(detections)
            if filtered_count < original_count:
                logger.info(f"Filtered {original_count - filtered_count} detections (NMS/area filters)")

    except HTTPException:
        raise
    except RuntimeError as e:
        error_msg = str(e)
        # Handle CUDA out of memory errors gracefully
        if "CUDA out of memory" in error_msg or "out of memory" in error_msg.lower():
            logger.error(f"CUDA out of memory during inference: {e}")
            # Try to recover by clearing cache
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            raise HTTPException(
                status_code=507,
                detail="GPU memory insufficient for this image. Try a smaller image or reduce batch size."
            )
        logger.error(f"Runtime error during inference: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")
    except Exception as e:
        logger.error(f"Text prompt inference failed: {e}")
        import traceback
        traceback.print_exc()
        # Clear GPU cache after errors
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

    # Clear cache periodically after inference to prevent memory fragmentation
    if torch.cuda.is_available() and model_state.inference_count % 10 == 0:
        torch.cuda.empty_cache()

    return detections, width, height


@torch.inference_mode()
def run_point_box_inference(
    image: Image.Image,
    points: Optional[List[List[float]]] = None,
    point_labels: Optional[List[bool]] = None,
    boxes: Optional[List[List[float]]] = None,
    confidence_threshold: float = 0.5
) -> Tuple[List[Detection], int, int]:
    """Run SAM3 inference with point/box prompts using add_geometric_prompt."""
    global model_state

    if not model_state.loaded or model_state.processor is None:
        result = load_sam3_model()
        if result is not True:
            raise HTTPException(status_code=503, detail=f"SAM3 model not available: {result}")

    # Check GPU memory before inference
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated(0) / (1024**3)
        total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        if allocated > 0.85 * total:
            logger.warning(f"GPU memory high ({allocated:.1f}GB/{total:.1f}GB), clearing cache...")
            torch.cuda.empty_cache()

    # Report results in the ORIGINAL image coordinate space.
    width, height = image.size
    # Honor max_image_size: oversized images are downscaled for inference, then
    # boxes/masks are scaled back so the response is unchanged at the cap.
    inference_image, scale = downscale_image_for_inference(image)
    # Input prompts are in original coords; scale them DOWN into inference space.
    inv_scale = 1.0 / scale if scale != 0 else 1.0
    if scale != 1.0:
        if boxes:
            boxes = [[coord * inv_scale for coord in box] for box in boxes]
        if points:
            points = [[coord * inv_scale for coord in point] for point in points]
    detections = []

    try:
        with _autocast_ctx():
            inference_state = model_state.processor.set_image(inference_image)
            model_state.processor.set_confidence_threshold(confidence_threshold)

            # Add geometric prompts (boxes and/or points)
            if boxes:
                for box in boxes:
                    inference_state = model_state.processor.add_geometric_prompt(
                        inference_state,
                        boxes=[box],
                        labels=[1]  # 1 = foreground
                    )

            if points and point_labels:
                for point, label in zip(points, point_labels):
                    inference_state = model_state.processor.add_geometric_prompt(
                        inference_state,
                        points=[point],
                        labels=[1 if label else 0]  # 1 = foreground, 0 = background
                    )

            # Extract results from state
            masks = inference_state.get("masks")
            result_boxes = inference_state.get("boxes")
            scores = inference_state.get("scores")

            if scores is not None and len(scores) > 0:
                # Convert tensors to numpy
                if isinstance(scores, torch.Tensor):
                    scores = scores.cpu().numpy()
                if isinstance(result_boxes, torch.Tensor):
                    result_boxes = result_boxes.cpu().numpy()
                if isinstance(masks, torch.Tensor):
                    masks = masks.cpu().numpy()

                for i in range(len(scores)):
                    confidence = float(scores[i])

                    if confidence < confidence_threshold:
                        continue

                    box = [0.0, 0.0, 0.0, 0.0]
                    if result_boxes is not None and i < len(result_boxes):
                        box_data = result_boxes[i]
                        if len(box_data) >= 4:
                            box = _rescale_box(
                                [float(box_data[0]), float(box_data[1]),
                                 float(box_data[2]), float(box_data[3])],
                                scale
                            )

                    detection = Detection(
                        class_name=f"object_{i}",
                        confidence=confidence,
                        box=box
                    )

                    if masks is not None and i < len(masks):
                        mask = masks[i]
                        while mask.ndim > 2:
                            mask = mask.squeeze(0)

                        mask_binary = (mask > 0.5).astype(np.uint8)
                        # Scale mask back to original image dimensions (no-op at scale 1.0)
                        mask_binary = _rescale_mask(mask_binary, width, height)
                        detection.area = int(mask_binary.sum())

                        if detection.box == [0.0, 0.0, 0.0, 0.0]:
                            detection.box = get_bbox_from_mask(mask_binary)

                        detection.mask_rle = mask_to_rle(mask_binary)
                        detection.mask_polygon = mask_to_polygon(mask_binary)

                    detections.append(detection)

            model_state.processor.reset_all_prompts(inference_state)
        model_state.record_inference()

    except HTTPException:
        raise
    except RuntimeError as e:
        error_msg = str(e)
        # Handle CUDA out of memory errors gracefully
        if "CUDA out of memory" in error_msg or "out of memory" in error_msg.lower():
            logger.error(f"CUDA out of memory during point/box inference: {e}")
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            raise HTTPException(
                status_code=507,
                detail="GPU memory insufficient for this image. Try a smaller image."
            )
        logger.error(f"Runtime error during point/box inference: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")
    except Exception as e:
        logger.error(f"Point/box inference failed: {e}")
        import traceback
        traceback.print_exc()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

    # Clear cache periodically
    if torch.cuda.is_available() and model_state.inference_count % 10 == 0:
        torch.cuda.empty_cache()

    return detections, width, height


# ================================
# Download Functions
# ================================
def run_download_with_progress():
    """Background task for downloading model with progress tracking"""
    global download_state
    
    try:
        download_state["status"] = "initializing"
        download_state["started_at"] = datetime.now().isoformat()
        download_state["progress"] = 5
        
        from download_models import download_sam3_model as dl_model, get_model_status
        
        download_state["status"] = "downloading"
        download_state["progress"] = 10
        
        # Run the download
        success = dl_model()
        
        if success:
            download_state["progress"] = 100
            download_state["status"] = "complete"
            download_state["error"] = None
            download_state["completed_at"] = datetime.now().isoformat()
            
            # Verify the download
            status = get_model_status()
            if status.get("downloaded"):
                logger.info(f"Model downloaded successfully to: {status.get('model_path')}")
            else:
                download_state["status"] = "failed"
                download_state["error"] = "Download completed but model not found"
        else:
            download_state["status"] = "failed"
            download_state["error"] = "Download failed. Check logs for details."
            
    except ImportError as e:
        logger.error(f"Download module not found: {e}")
        download_state["status"] = "failed"
        download_state["error"] = f"Download module error: {e}"
    except Exception as e:
        logger.error(f"Download failed: {e}")
        download_state["status"] = "failed"
        download_state["error"] = str(e)
    finally:
        download_state["in_progress"] = False


# ================================
# FastAPI Lifespan
# ================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("=" * 60)
    logger.info("Lableit Inference Service starting...")
    logger.info("=" * 60)
    logger.info(f"Device: {DEVICE}")
    logger.info(f"Models directory: {MODEL_CACHE_DIR}")
    logger.info(f"Config file: {CONFIG_FILE}")
    
    # Load settings
    settings = load_settings()
    
    # Check SAM3 installation
    installed, msg = check_sam3_installation()
    if installed:
        logger.info(f"SAM3 installation: OK ({msg})")
    else:
        logger.warning(f"SAM3 installation: {msg}")
    
    # Auto-preload model if configured and GPU is available
    if not SAM3_AVAILABLE:
        logger.warning("=" * 60)
        logger.warning("GPU NOT AVAILABLE - SAM3 inference is disabled")
        logger.warning("The service is running in LIMITED MODE:")
        logger.warning("  - Health check endpoints will respond")
        logger.warning("  - Model status endpoints will respond")
        logger.warning("  - Inference requests will return GPU requirement error")
        logger.warning("  - Manual annotation in frontend will still work")
        logger.warning("To enable AI inference, run on a machine with CUDA GPU")
        logger.warning("=" * 60)
    elif settings.get("preload_on_startup", True):
        logger.info("Auto-loading SAM3 model on startup...")
        result = load_sam3_model()
        if result is True:
            logger.info("SAM3 model successfully loaded!")
        else:
            logger.warning(f"SAM3 model could not be loaded at startup: {result}")
            logger.warning("Model will attempt to load on first inference request.")
    else:
        logger.info("Skipping model preload (disabled in settings)")
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down...")
    unload_sam3_model()
    logger.info("Cleanup complete")


# ================================
# FastAPI Application
# ================================
app = FastAPI(
    title="Lableit Inference Service",
    description="SAM3-powered image segmentation with text prompts",
    version="2.1.0",
    lifespan=lifespan
)

# CORS middleware.
#
# SECURITY: This inference service is designed to run on a PRIVATE network behind
# the Lableit API (server-to-server only) and MUST NOT be exposed publicly. The
# CORS allow-list is driven by INFERENCE_ALLOWED_ORIGINS (default '*' for private
# deployments); set it to your trusted origins when the service is reachable by
# browsers. Credentials/cookies are never used, so allow_credentials is False
# (a wildcard origin with credentials is also disallowed by the CORS spec).
app.add_middleware(
    CORSMiddleware,
    allow_origins=INFERENCE_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================================
# Health & Status Endpoints
# ================================
@app.get("/health")
def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "device": DEVICE,
        "cuda_available": torch.cuda.is_available(),
        "cuda_device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "model_loaded": model_state.loaded,
        "models_available": ["sam3"],
        "version": "2.1.0"
    }


@app.get("/models")
def list_models():
    """List available models"""
    return {
        "models": [
            ModelInfo(
                id="sam3",
                name="SAM3 (Segment Anything 3)",
                loaded=model_state.loaded,
                device=DEVICE,
                supports_text_prompts=True
            )
        ]
    }


@app.get("/models/status")
def get_model_status_endpoint():
    """Get detailed model status including download state"""
    try:
        from download_models import get_model_status as get_dl_status, get_download_info
        dl_status = get_dl_status()
        dl_info = get_download_info()
    except ImportError:
        dl_status = {"downloaded": False, "model_path": None, "source": None}
        dl_info = {"models_dir": MODEL_CACHE_DIR}
    
    model_status = model_state.get_status()
    
    # Calculate model size if downloaded
    model_size_mb = None
    model_path = dl_status.get("model_path")
    if model_path and os.path.exists(model_path):
        model_size_mb = os.path.getsize(model_path) / (1024 * 1024)
    
    # Determine if inference is available
    inference_available = SAM3_AVAILABLE and model_status["loaded"]
    
    # Build helpful status message
    if not SAM3_AVAILABLE:
        status_message = "GPU Required: SAM3 requires a CUDA-capable GPU. Manual annotation is still available."
    elif not dl_status.get("downloaded", False):
        status_message = "Model not downloaded. Click 'Download Model' in settings to get started."
    elif not model_status["loaded"]:
        status_message = "Model downloaded but not loaded. Click 'Load Model' in settings."
    else:
        status_message = "Ready for inference"

    return {
        "downloaded": dl_status.get("downloaded", False),
        "model_path": dl_status.get("model_path"),
        "model_size_mb": model_size_mb,
        "source": dl_status.get("source"),
        "model_loaded": model_status["loaded"],
        "load_error": model_status["load_error"],
        "load_time": model_status["load_time"],
        "last_inference": model_status["last_inference"],
        "inference_count": model_status["inference_count"],
        "device": DEVICE,
        "cuda_available": CUDA_AVAILABLE,
        "cuda_required": False,
        "inference_available": inference_available,
        "status_message": status_message,
        "cuda_device": torch.cuda.get_device_name(0) if CUDA_AVAILABLE else None,
        "models_dir": dl_info.get("models_dir", MODEL_CACHE_DIR),
        "download": {
            "in_progress": download_state["in_progress"],
            "progress": download_state["progress"],
            "status": download_state["status"],
            "error": download_state["error"],
            "started_at": download_state.get("started_at"),
            "completed_at": download_state.get("completed_at")
        }
    }


@app.get("/models/sam3/verify")
def verify_model():
    """Verify model is working by running a quick test"""
    if not model_state.loaded:
        return {"status": "not_loaded", "message": "Model not loaded"}
    
    try:
        test_image = Image.new('RGB', (64, 64), color='blue')
        _ = model_state.processor.set_image(test_image)
        return {
            "status": "ok",
            "message": "Model is working correctly",
            "device": DEVICE
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Model verification failed: {e}"
        }


# ================================
# Model Management Endpoints
# ================================
@app.post("/models/sam3/load", dependencies=[Depends(require_shared_secret)])
def load_model_endpoint():
    """Load SAM3 model into memory"""
    result = load_sam3_model(force=True)
    if result is True:
        return {
            "status": "loaded",
            "model": "sam3",
            "device": DEVICE,
            "message": "Model loaded successfully"
        }
    else:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load SAM3 model: {result}"
        )


@app.post("/models/sam3/unload", dependencies=[Depends(require_shared_secret)])
def unload_model_endpoint():
    """Unload SAM3 model from memory"""
    unload_sam3_model()
    return {"status": "unloaded", "model": "sam3"}


@app.post("/models/sam3/download", dependencies=[Depends(require_shared_secret)])
def download_model_endpoint():
    """Start SAM3 model download in background"""
    global download_state
    
    if download_state["in_progress"]:
        return {
            "status": "already_downloading",
            "progress": download_state["progress"]
        }
    
    try:
        from download_models import get_model_status as get_dl_status
        status = get_dl_status()
        if status.get("downloaded"):
            return {
                "status": "already_downloaded",
                "model_path": status.get("model_path")
            }
    except ImportError:
        pass
    
    download_state["in_progress"] = True
    download_state["progress"] = 0
    download_state["status"] = "starting"
    download_state["error"] = None
    download_state["started_at"] = None
    download_state["completed_at"] = None
    
    download_thread = threading.Thread(target=run_download_with_progress, daemon=True)
    download_thread.start()
    
    return {
        "status": "started",
        "message": "Model download started. Poll /models/status for progress.",
        "estimated_size_gb": "2-4"
    }


@app.get("/models/sam3/download/status")
def get_download_status():
    """Get current download progress"""
    return download_state


# ================================
# Configuration Endpoints
# ================================
@app.get("/config")
def get_config():
    """Get current model configuration"""
    return get_model_config()


@app.post("/config", dependencies=[Depends(require_shared_secret)])
def update_config(config: ConfigUpdate):
    """Update model configuration"""
    current_config = get_model_config()
    
    if config.model_path:
        current_config["model_path"] = config.model_path
    
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(current_config, f, indent=2)
        return current_config
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save config: {str(e)}")


@app.get("/settings")
def get_settings():
    """Get current inference settings"""
    return load_settings()


@app.post("/settings", dependencies=[Depends(require_shared_secret)])
def update_settings(updates: SettingsUpdate):
    """Update inference settings"""
    current = load_settings()
    
    update_dict = updates.model_dump(exclude_none=True)
    current.update(update_dict)
    
    save_settings(current)
    return current


# ================================
# Inference Endpoints
# ================================
@app.post("/infer/text", response_model=InferenceResponse, dependencies=[Depends(require_shared_secret)])
def infer_with_text(request: TextPromptRequest):
    """Run inference with text prompts - primary endpoint for Lableit
    
    Accuracy improvement parameters:
    - iou_threshold: IoU threshold for NMS (0.0-1.0, default 0.5)
    - min_box_area: Minimum box area in pixels (default 100)
    - max_detections_per_class: Max detections per class (default 100)
    """
    start_time = time.time()

    image = get_image(request.image_url, request.image_base64)

    detections, width, height = run_text_prompt_inference(
        image=image,
        prompts=request.prompts,
        confidence_threshold=request.confidence_threshold,
        return_masks=request.return_masks,
        return_boxes=request.return_boxes,
        iou_threshold=request.iou_threshold,
        min_box_area=request.min_box_area,
        max_detections_per_class=request.max_detections_per_class
    )

    processing_time = (time.time() - start_time) * 1000

    return InferenceResponse(
        detections=detections,
        image_width=width,
        image_height=height,
        processing_time_ms=processing_time
    )


@app.post("/infer/points", response_model=InferenceResponse, dependencies=[Depends(require_shared_secret)])
def infer_with_points(request: PointPromptRequest):
    """Run inference with point/box prompts for interactive segmentation"""
    start_time = time.time()
    
    image = get_image(request.image_url, request.image_base64)
    
    detections, width, height = run_point_box_inference(
        image=image,
        points=request.points,
        point_labels=request.point_labels,
        boxes=request.boxes,
        confidence_threshold=request.confidence_threshold
    )
    
    processing_time = (time.time() - start_time) * 1000
    
    return InferenceResponse(
        detections=detections,
        image_width=width,
        image_height=height,
        processing_time_ms=processing_time
    )


@app.post("/infer/upload", dependencies=[Depends(require_shared_secret)])
async def infer_with_upload(
    file: UploadFile = File(...),
    prompts: str = Form(...),
    confidence_threshold: float = Form(0.5),
    return_masks: bool = Form(True)
):
    """Run inference by uploading an image file directly.

    Input validation: only image content-types are accepted, the upload is
    capped at INFERENCE_MAX_UPLOAD_BYTES, and the prompt list is capped at
    INFERENCE_MAX_PROMPTS. Bad input returns a clean 4xx.
    """
    start_time = time.time()

    # Validate confidence threshold range (matches the JSON endpoints' contract).
    if not (0.0 <= confidence_threshold <= 1.0):
        raise HTTPException(status_code=400, detail="confidence_threshold must be between 0.0 and 1.0")

    # Validate declared content-type (best-effort; real decode is verified below).
    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported content type '{file.content_type}'. Expected an image/* upload."
        )

    # Read with a hard size cap to avoid unbounded memory use.
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Uploaded file too large ({len(contents)} bytes); limit is {MAX_UPLOAD_BYTES} bytes"
        )

    # Decode the image; reject anything that is not a valid image.
    try:
        image = Image.open(BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid or unreadable image file: {e}")

    prompt_list = [p.strip() for p in prompts.split(',') if p.strip()]

    if not prompt_list:
        raise HTTPException(status_code=400, detail="At least one prompt is required")
    if len(prompt_list) > MAX_PROMPTS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many prompts ({len(prompt_list)}); limit is {MAX_PROMPTS}"
        )

    detections, width, height = run_text_prompt_inference(
        image=image,
        prompts=prompt_list,
        confidence_threshold=confidence_threshold,
        return_masks=return_masks,
        return_boxes=True
    )

    processing_time = (time.time() - start_time) * 1000

    return InferenceResponse(
        detections=detections,
        image_width=width,
        image_height=height,
        processing_time_ms=processing_time
    )


# ================================
# GPU & Memory Endpoints
# ================================
@app.get("/gpu/info")
def gpu_info():
    """Get GPU information"""
    if not torch.cuda.is_available():
        return {"cuda_available": False}
    
    return {
        "cuda_available": True,
        "device_count": torch.cuda.device_count(),
        "current_device": torch.cuda.current_device(),
        "device_name": torch.cuda.get_device_name(0),
        "memory_allocated_mb": round(torch.cuda.memory_allocated(0) / 1024 / 1024, 2),
        "memory_reserved_mb": round(torch.cuda.memory_reserved(0) / 1024 / 1024, 2),
        "max_memory_allocated_mb": round(torch.cuda.max_memory_allocated(0) / 1024 / 1024, 2),
        "memory_total_mb": round(torch.cuda.get_device_properties(0).total_memory / 1024 / 1024, 2)
    }


@app.post("/gpu/clear_cache", dependencies=[Depends(require_shared_secret)])
def clear_gpu_cache():
    """Clear GPU memory cache"""
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
        return {"status": "cache_cleared"}
    return {"status": "no_cuda"}


@app.get("/memory/status")
def memory_status():
    """Get current memory usage"""
    result = {
        "model_loaded": model_state.loaded,
        "model": "sam3" if model_state.loaded else None,
        "inference_count": model_state.inference_count
    }
    
    if torch.cuda.is_available():
        result.update({
            "cuda_available": True,
            "memory_allocated_mb": round(torch.cuda.memory_allocated(0) / 1024 / 1024, 2),
            "memory_reserved_mb": round(torch.cuda.memory_reserved(0) / 1024 / 1024, 2),
        })
    else:
        result["cuda_available"] = False
    
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

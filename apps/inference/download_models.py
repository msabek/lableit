"""
SAM3 Model Downloader
Downloads models to the local ./models directory within the inference service
Prioritizes ModelScope, with HuggingFace as fallback
Includes progress tracking, retry logic, and integrity validation
"""

import os
import sys
import logging
import json
import shutil
import time
import hashlib
from datetime import datetime
from typing import Optional, Tuple, Callable

try:
    from huggingface_hub import login, snapshot_download, hf_hub_download
    HF_HUB_AVAILABLE = True
except ImportError:
    HF_HUB_AVAILABLE = False

try:
    from modelscope import snapshot_download as ms_download
    MODELSCOPE_AVAILABLE = True
except ImportError:
    MODELSCOPE_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(SCRIPT_DIR, "models")
CONFIG_FILE = os.path.join(SCRIPT_DIR, "model_config.json")

# Model specifications
MODEL_SPECS = {
    "sam3": {
        "huggingface_repo": "facebook/sam3",
        "modelscope_repo": "facebook/sam3",
        "expected_files": ["sam3.pt", "config.json"],
        "min_size_mb": 100,  # Minimum expected size in MB
        "estimated_size_gb": 2.5  # Approximate download size
    }
}

# Progress callback type
ProgressCallback = Callable[[int, str, Optional[int], Optional[int]], None]


def ensure_models_dir():
    """Ensure the models directory exists"""
    if not os.path.exists(MODELS_DIR):
        os.makedirs(MODELS_DIR, exist_ok=True)
        logger.info(f"Created models directory: {MODELS_DIR}")


def get_model_status() -> dict:
    """Get current model status with detailed information"""
    result = {
        "downloaded": False,
        "model_path": None,
        "source": None,
        "base_dir": None,
        "size_mb": None,
        "download_date": None,
        "validated": False
    }
    
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                config = json.load(f)
                model_path = config.get("model_path")
                
                if model_path and os.path.exists(model_path):
                    result["downloaded"] = True
                    result["model_path"] = model_path
                    result["source"] = config.get("source", "unknown")
                    result["base_dir"] = config.get("base_dir")
                    result["download_date"] = config.get("download_date")
                    
                    # Get file size
                    if os.path.isfile(model_path):
                        result["size_mb"] = os.path.getsize(model_path) / (1024 * 1024)
                    elif os.path.isdir(model_path):
                        total_size = sum(
                            os.path.getsize(os.path.join(dirpath, filename))
                            for dirpath, _, filenames in os.walk(model_path)
                            for filename in filenames
                        )
                        result["size_mb"] = total_size / (1024 * 1024)
                    
                    # Validate the model
                    result["validated"] = validate_model_files(model_path)
                    
        except Exception as e:
            logger.warning(f"Error reading config: {e}")
    
    return result


def validate_model_files(path: str) -> bool:
    """Validate that model files exist and have reasonable sizes"""
    if not path or not os.path.exists(path):
        return False
    
    # If it's a file, check size
    if os.path.isfile(path):
        size_mb = os.path.getsize(path) / (1024 * 1024)
        return size_mb >= MODEL_SPECS["sam3"]["min_size_mb"]
    
    # If it's a directory, check for expected files
    if os.path.isdir(path):
        # Look for .pt or .pth files
        for root, _, files in os.walk(path):
            for f in files:
                if f.endswith(('.pt', '.pth')):
                    fpath = os.path.join(root, f)
                    size_mb = os.path.getsize(fpath) / (1024 * 1024)
                    if size_mb >= MODEL_SPECS["sam3"]["min_size_mb"]:
                        return True
    
    return False


def find_checkpoint_file(path: str) -> Optional[str]:
    """Find the checkpoint file in the downloaded model directory"""
    if not path or not os.path.exists(path):
        return None
    
    # If path is already a file
    if os.path.isfile(path) and path.endswith(('.pt', '.pth')):
        return path
    
    checkpoint_file = None
    candidates = []
    
    for root, _, files in os.walk(path):
        for file in files:
            if file.endswith((".pt", ".pth")):
                candidate = os.path.join(root, file)
                size_mb = os.path.getsize(candidate) / (1024 * 1024)
                candidates.append((candidate, size_mb, file))
    
    if not candidates:
        return None
    
    # Prefer larger files and those with 'large' in name
    candidates.sort(key=lambda x: (
        'large' in x[2].lower(),
        x[1]  # size
    ), reverse=True)
    
    return candidates[0][0]


def save_model_config(
    path: str,
    source: str,
    download_date: Optional[str] = None
) -> bool:
    """Save model configuration for main.py to use"""
    try:
        checkpoint_file = find_checkpoint_file(path)
        
        if not checkpoint_file:
            checkpoint_file = path
        
        config = {
            "model_path": checkpoint_file,
            "source": source,
            "base_dir": path,
            "local": True,
            "download_date": download_date or datetime.now().isoformat()
        }
        
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)
        
        logger.info(f"Saved model config to {CONFIG_FILE}")
        logger.info(f"Selected checkpoint: {checkpoint_file}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to save model config: {e}")
        return False


def setup_huggingface_auth() -> bool:
    """Setup HuggingFace authentication from environment variable"""
    if not HF_HUB_AVAILABLE:
        return False
    
    token = os.environ.get("HF_TOKEN")
    if not token:
        logger.info("HF_TOKEN environment variable not set.")
        return False
    
    try:
        logger.info("Authenticating with HuggingFace...")
        login(token=token)
        logger.info("HuggingFace authentication successful!")
        return True
    except Exception as e:
        logger.error(f"HuggingFace authentication failed: {e}")
        return False


def download_from_modelscope(
    progress_callback: Optional[ProgressCallback] = None,
    max_retries: int = 3
) -> Tuple[bool, str]:
    """
    Download from ModelScope as primary source.
    Returns (success, message_or_path)
    """
    if not MODELSCOPE_AVAILABLE:
        return False, "ModelScope library not installed. Run: pip install modelscope"
    
    logger.info("=" * 50)
    logger.info("Downloading SAM3 from ModelScope...")
    logger.info("=" * 50)
    
    ensure_models_dir()
    model_id = MODEL_SPECS["sam3"]["modelscope_repo"]
    local_dir = os.path.join(MODELS_DIR, "facebook", "sam3")
    
    for attempt in range(max_retries):
        try:
            if progress_callback:
                progress_callback(
                    10 + (attempt * 5),
                    f"Downloading from ModelScope (attempt {attempt + 1}/{max_retries})",
                    None,
                    None
                )
            
            logger.info(f"Download attempt {attempt + 1}/{max_retries}")
            
            # Download with exclusion of redundant files
            path = ms_download(
                model_id,
                cache_dir=MODELS_DIR,
                ignore_file_pattern=['*.safetensors', '*.bin']
            )
            
            if progress_callback:
                progress_callback(80, "Download complete, verifying...", None, None)
            
            logger.info(f"Downloaded to: {path}")
            
            # Copy to our local models dir if it went elsewhere
            if not path.startswith(MODELS_DIR):
                logger.info("Copying model to local directory...")
                if os.path.exists(local_dir):
                    shutil.rmtree(local_dir)
                os.makedirs(os.path.dirname(local_dir), exist_ok=True)
                shutil.copytree(path, local_dir)
                path = local_dir
                logger.info(f"Model copied to: {path}")
            
            # Validate download
            if not validate_model_files(path):
                raise ValueError("Downloaded files failed validation")
            
            if progress_callback:
                progress_callback(95, "Saving configuration...", None, None)
            
            save_model_config(path, "modelscope")
            
            if progress_callback:
                progress_callback(100, "Complete!", None, None)
            
            logger.info("[SUCCESS] SAM3 model downloaded from ModelScope!")
            return True, path
            
        except Exception as e:
            logger.error(f"ModelScope download attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                wait_time = (attempt + 1) * 5
                logger.info(f"Retrying in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                return False, f"ModelScope download failed after {max_retries} attempts: {e}"
    
    return False, "Download failed"


def download_from_huggingface(
    progress_callback: Optional[ProgressCallback] = None,
    max_retries: int = 3
) -> Tuple[bool, str]:
    """
    Download from HuggingFace as fallback.
    Returns (success, message_or_path)
    """
    if not HF_HUB_AVAILABLE:
        return False, "huggingface_hub library not installed"
    
    if not os.environ.get("HF_TOKEN"):
        return False, "HF_TOKEN not set"
    
    logger.info("=" * 50)
    logger.info("Downloading SAM3 from HuggingFace...")
    logger.info("=" * 50)
    
    ensure_models_dir()
    local_dir = os.path.join(MODELS_DIR, "facebook", "sam3")
    
    for attempt in range(max_retries):
        try:
            if progress_callback:
                progress_callback(
                    10 + (attempt * 5),
                    f"Downloading from HuggingFace (attempt {attempt + 1}/{max_retries})",
                    None,
                    None
                )
            
            logger.info(f"Download attempt {attempt + 1}/{max_retries}")
            
            # Download and exclude safetensors to save bandwidth
            path = snapshot_download(
                repo_id="facebook/sam3",
                local_dir=local_dir,
                ignore_patterns=["*.safetensors"]
            )
            
            if progress_callback:
                progress_callback(80, "Download complete, verifying...", None, None)
            
            # Validate download
            if not validate_model_files(path):
                raise ValueError("Downloaded files failed validation")
            
            if progress_callback:
                progress_callback(95, "Saving configuration...", None, None)
            
            save_model_config(path, "huggingface")
            
            if progress_callback:
                progress_callback(100, "Complete!", None, None)
            
            logger.info("[SUCCESS] SAM3 model downloaded from HuggingFace!")
            return True, path
            
        except Exception as e:
            logger.error(f"HuggingFace download attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                wait_time = (attempt + 1) * 5
                logger.info(f"Retrying in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                return False, f"HuggingFace download failed after {max_retries} attempts: {e}"
    
    return False, "Download failed"


def download_sam3_model(
    progress_callback: Optional[ProgressCallback] = None
) -> bool:
    """
    Download SAM3 model checkpoints.
    Strategy: ModelScope first, then HuggingFace as fallback.
    
    Args:
        progress_callback: Optional callback function(progress, status, bytes_downloaded, total_bytes)
    
    Returns:
        True if successful, False otherwise
    """
    # Check if already downloaded
    status = get_model_status()
    if status["downloaded"] and status["validated"]:
        logger.info(f"Model already downloaded and validated at: {status['model_path']}")
        if progress_callback:
            progress_callback(100, "Already downloaded", None, None)
        return True
    
    logger.info("=" * 60)
    logger.info("Starting SAM3 Model Download")
    logger.info(f"Estimated size: ~{MODEL_SPECS['sam3']['estimated_size_gb']}GB")
    logger.info("=" * 60)
    
    if progress_callback:
        progress_callback(0, "Starting download...", None, None)
    
    # Strategy 1: ModelScope (Primary - no auth required, faster in some regions)
    if MODELSCOPE_AVAILABLE:
        success, result = download_from_modelscope(progress_callback)
        if success:
            return True
        logger.warning(f"ModelScope download failed: {result}")
    else:
        logger.info("ModelScope not available, skipping...")
    
    # Strategy 2: HuggingFace (Fallback)
    logger.info("Trying HuggingFace fallback...")
    setup_huggingface_auth()
    
    if HF_HUB_AVAILABLE:
        success, result = download_from_huggingface(progress_callback)
        if success:
            return True
        logger.warning(f"HuggingFace download failed: {result}")
    else:
        logger.info("HuggingFace hub not available")
    
    if progress_callback:
        progress_callback(0, "Download failed", None, None)
    
    logger.error("=" * 60)
    logger.error("DOWNLOAD FAILED")
    logger.error("Could not download from ModelScope or HuggingFace")
    logger.error("=" * 60)
    
    return False


def get_download_info() -> dict:
    """Get information for display in UI"""
    status = get_model_status()
    
    return {
        "downloaded": status["downloaded"],
        "validated": status.get("validated", False),
        "model_path": status.get("model_path"),
        "source": status.get("source"),
        "size_mb": status.get("size_mb"),
        "download_date": status.get("download_date"),
        "models_dir": MODELS_DIR,
        "config_file": CONFIG_FILE,
        "modelscope_available": MODELSCOPE_AVAILABLE,
        "huggingface_available": HF_HUB_AVAILABLE and bool(os.environ.get("HF_TOKEN")),
        "estimated_size_gb": MODEL_SPECS["sam3"]["estimated_size_gb"]
    }


def clear_model_cache() -> bool:
    """Clear downloaded model cache"""
    try:
        if os.path.exists(MODELS_DIR):
            shutil.rmtree(MODELS_DIR)
            os.makedirs(MODELS_DIR, exist_ok=True)
            logger.info("Model cache cleared")
        
        if os.path.exists(CONFIG_FILE):
            os.remove(CONFIG_FILE)
            logger.info("Config file removed")
        
        return True
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("   SAM3 Model Downloader")
    print("=" * 60)
    print(f"   Models Directory: {MODELS_DIR}")
    print(f"   Config File: {CONFIG_FILE}")
    print(f"   ModelScope Available: {MODELSCOPE_AVAILABLE}")
    print(f"   HuggingFace Available: {HF_HUB_AVAILABLE}")
    print()
    
    # Check current status
    status = get_model_status()
    if status["downloaded"] and status["validated"]:
        print(f"[OK] Model already downloaded and validated")
        print(f"     Path: {status['model_path']}")
        print(f"     Source: {status['source']}")
        print(f"     Size: {status['size_mb']:.1f} MB" if status['size_mb'] else "")
        sys.exit(0)
    
    # Define progress callback for CLI
    def cli_progress(progress: int, status: str, downloaded: Optional[int], total: Optional[int]):
        bar_width = 40
        filled = int(bar_width * progress / 100)
        bar = '█' * filled + '░' * (bar_width - filled)
        print(f"\r[{bar}] {progress}% - {status}", end='', flush=True)
        if progress == 100:
            print()
    
    # Try HuggingFace auth but don't require it
    setup_huggingface_auth()
    
    if download_sam3_model(cli_progress):
        print("\n[SUCCESS] Model ready.")
        sys.exit(0)
    else:
        print("\n[FAILURE] Could not download model.")
        print("Tips:")
        print("  1. Install modelscope: pip install modelscope")
        print("  2. Or set HF_TOKEN environment variable for HuggingFace")
        sys.exit(1)

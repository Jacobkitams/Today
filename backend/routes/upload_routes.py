import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import io
import uuid
import logging
import shutil
import subprocess
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from PIL import Image, ImageOps
from auth import get_current_user
from models import User

logger = logging.getLogger(__name__)

# Prevent DecompressionBombError on high-resolution camera photos (e.g. 100 megapixels)
Image.MAX_IMAGE_PIXELS = 100_000_000

router = APIRouter()

# ---------------------------------------------------------------------------
# Image compression
# ---------------------------------------------------------------------------
# Uploaded photos come straight off phones/cameras and can be 10-15 MB each.
# Downscale + recompress on the way in so pages don't ship multi-megabyte
# images to every visitor. Animated images are left untouched so we don't
# silently strip their animation.
# ---------------------------------------------------------------------------
MAX_IMAGE_DIMENSION = 1920  # px, longest side
JPEG_QUALITY = 82

def _compress_image(content: bytes, ext: str) -> tuple[bytes, str]:
    """Resize + recompress image bytes. Returns (new_bytes, new_ext).
    Falls back to the original content/ext untouched on any failure
    (corrupt file, unsupported format, animated GIF/WebP, ...) so an
    upload never hard-fails because of this step."""
    try:
        img = Image.open(io.BytesIO(content))
        if getattr(img, "is_animated", False):
            return content, ext

        img = ImageOps.exif_transpose(img)  # honor camera rotation before dropping EXIF
        has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)

        img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.LANCZOS)

        buf = io.BytesIO()
        if has_alpha:
            img.convert("RGBA").save(buf, format="PNG", optimize=True)
            new_ext = ".png"
        else:
            img.convert("RGB").save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            new_ext = ".jpg"

        new_bytes = buf.getvalue()
        # Only use the recompressed version if it's actually smaller.
        if len(new_bytes) < len(content):
            return new_bytes, new_ext
        return content, ext
    except Exception:
        return content, ext

# ---------------------------------------------------------------------------
# Video transcoding
# ---------------------------------------------------------------------------
# MOV, AVI, MKV, WMV, FLV etc. are not natively playable in most browsers.
# When ffmpeg is available, transcode them to MP4 (H.264 video + AAC audio)
# which every browser supports. Falls back silently if ffmpeg is absent.
# ---------------------------------------------------------------------------

# Extensions that browsers can natively play — no transcoding needed.
BROWSER_NATIVE_VIDEO_EXTS = {".mp4", ".webm", ".ogg", ".ogv"}

def _needs_transcode(ext: str) -> bool:
    return ext.lower() not in BROWSER_NATIVE_VIDEO_EXTS

def _transcode_to_mp4(content: bytes, src_ext: str) -> tuple[bytes, str]:
    """Convert video bytes to H.264/AAC MP4 using ffmpeg.
    Returns (mp4_bytes, '.mp4') on success, or (original_bytes, src_ext) if
    ffmpeg is not installed or conversion fails."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        logger.warning("ffmpeg not found — video stored as-is (%s)", src_ext)
        return content, src_ext

    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, f"input{src_ext}")
        out_path = os.path.join(tmpdir, "output.mp4")

        with open(src_path, "wb") as f:
            f.write(content)

        cmd = [
            ffmpeg_bin,
            "-y",                      # overwrite output
            "-i", src_path,
            "-c:v", "libx264",         # H.264 video — supported by all browsers
            "-preset", "fast",         # fast encode, good quality
            "-crf", "23",              # constant quality (18=great, 28=fast/smaller)
            "-c:a", "aac",             # AAC audio — widely supported
            "-b:a", "128k",
            "-movflags", "+faststart", # put moov atom at start for streaming
            "-pix_fmt", "yuv420p",     # ensure broad compatibility
            out_path,
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=300,  # 5-minute timeout
            )
            if result.returncode != 0:
                logger.error("ffmpeg transcode failed: %s", result.stderr.decode(errors="replace"))
                return content, src_ext

            with open(out_path, "rb") as f:
                mp4_bytes = f.read()

            logger.info(
                "Transcoded %s → .mp4 (%d MB → %d MB)",
                src_ext,
                len(content) // (1024 * 1024),
                len(mp4_bytes) // (1024 * 1024),
            )
            return mp4_bytes, ".mp4"
        except subprocess.TimeoutExpired:
            logger.error("ffmpeg transcode timed out for %s", src_ext)
            return content, src_ext
        except Exception as e:
            logger.error("ffmpeg transcode error: %s", e)
            return content, src_ext

# Base path to the frontend assets folder
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "assets")
IMAGES_DIR   = os.path.join(FRONTEND_DIR, "images")
VIDEOS_DIR   = os.path.join(FRONTEND_DIR, "videos")

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/pjpeg",
    "image/jpg",
    "image/png",
    "image/x-png",
    "image/webp",
    "image/gif",
}
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".jfif"}
# Accept any browser-playable video / QuickTime / AVI etc. Servers may report
# generic types (application/octet-stream, application/x-msvideo, ...) for
# common formats, so fall back to a wide allowlist of known video extensions.
ALLOWED_VIDEO_TYPES = {
    "video/mp4", "video/webm", "video/ogg", "video/ogv", "video/x-msvideo",
    "video/quicktime", "video/mpeg", "video/3gpp", "video/3gpp2",
    "video/x-m4v", "video/mp2t", "video/x-matroska", "video/x-flv",
    "video/x-m4v", "application/octet-stream", "application/x-mpegURL",
    "video/wmv", "video/x-wmv", "video/avi",
}
ALLOWED_VIDEO_EXTS = {
    ".mp4", ".webm", ".ogg", ".ogv", ".mov", ".mkv", ".avi", ".m4v",
    ".m4a", ".mpg", ".mpeg", ".mpe", ".m1v", ".m2v", ".3gp", ".3g2",
    ".3gpp", ".3gpp2", ".flv", ".mts", ".m2ts", ".ts", ".m2t",
    ".wmv", ".asf", ".vob", ".qt", ".mxf", ".rmvb",
}
MAX_IMAGE_SIZE = 500 * 1024 * 1024   # 500 MB
MAX_VIDEO_SIZE = 300 * 1024 * 1024  # 300 MB
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # Starlette multipart limit (must cover largest file)

def _save_file(upload: UploadFile, dest_dir: str, allowed_types: set, max_size: int) -> str:
    ext = os.path.splitext(upload.filename or "")[1].lower() or ".bin"
    # Validate MIME type with fallback to extension for images/videos/documents
    if upload.content_type not in allowed_types:
        if dest_dir == IMAGES_DIR and ext in ALLOWED_IMAGE_EXTS:
            pass
        elif "videos" in dest_dir and (ext in ALLOWED_VIDEO_EXTS or upload.content_type in ALLOWED_VIDEO_TYPES):
            pass
        elif "documents" in dest_dir and ext in {".pdf", ".doc", ".docx", ".txt", ".rtf", ".csv", ".xls", ".xlsx", ".ppt", ".pptx"}:
            pass
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {upload.content_type or 'unknown'} (ext: {ext}).")
    content = upload.file.read()
    if len(content) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {limit_mb} MB.")

    if dest_dir == IMAGES_DIR:
        content, ext = _compress_image(content, ext)
    elif "videos" in dest_dir and _needs_transcode(ext):
        # Transcode non-browser-native formats (MOV, AVI, MKV, WMV…) → MP4
        content, ext = _transcode_to_mp4(content, ext)

    filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(dest_dir, filename)
    os.makedirs(dest_dir, exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(content)
    return filename


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    try:
        filename = _save_file(file, IMAGES_DIR, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE)
        return {"url": f"/assets/images/{filename}", "filename": filename}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image upload failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Image upload processing failed: {str(e)}")

@router.post("/images")
async def upload_multiple_images(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user)
):
    try:
        results = []
        for file in files:
            filename = _save_file(file, IMAGES_DIR, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE)
            results.append({"url": f"/assets/images/{filename}", "filename": filename})
        return {"images": results, "urls": [r["url"] for r in results]}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Multiple images upload failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Multiple images upload failed: {str(e)}")

@router.post("/video")
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    try:
        filename = _save_file(file, VIDEOS_DIR, ALLOWED_VIDEO_TYPES, MAX_VIDEO_SIZE)
        return {"url": f"/assets/videos/{filename}", "filename": filename}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video upload failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Video upload processing failed: {str(e)}")

ALLOWED_DOCUMENT_TYPES = {"application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"}
DOCUMENTS_DIR = os.path.join(FRONTEND_DIR, "documents")
MAX_DOCUMENT_SIZE = 20 * 1024 * 1024 # 20 MB

@router.post("/document")
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    filename = _save_file(file, DOCUMENTS_DIR, ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE)
    return {"url": f"/assets/documents/{filename}", "filename": filename}

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import io
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from PIL import Image, ImageOps
from auth import get_current_user
from models import User

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

# Base path to the frontend assets folder
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "assets")
IMAGES_DIR   = os.path.join(FRONTEND_DIR, "images")
VIDEOS_DIR   = os.path.join(FRONTEND_DIR, "videos")

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/ogg"}
MAX_IMAGE_SIZE = 20 * 1024 * 1024   # 20 MB
MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200 MB
MAX_UPLOAD_BYTES = MAX_VIDEO_SIZE   # Starlette multipart limit (must cover video)

def _save_file(upload: UploadFile, dest_dir: str, allowed_types: set, max_size: int) -> str:
    ext = os.path.splitext(upload.filename or "")[1].lower() or ".bin"
    if upload.content_type not in allowed_types:
        # Fallback for documents: allow based on extension if MIME type is unrecognised
        if "documents" in dest_dir and ext in {".pdf", ".doc", ".docx", ".txt", ".rtf", ".csv", ".xls", ".xlsx", ".ppt", ".pptx"}:
            pass
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {upload.content_type} (ext: {ext})")
    content = upload.file.read()
    if len(content) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {limit_mb} MB.")

    if dest_dir == IMAGES_DIR:
        content, ext = _compress_image(content, ext)

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
    filename = _save_file(file, IMAGES_DIR, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE)
    return {"url": f"/assets/images/{filename}", "filename": filename}

@router.post("/video")
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    filename = _save_file(file, VIDEOS_DIR, ALLOWED_VIDEO_TYPES, MAX_VIDEO_SIZE)
    return {"url": f"/assets/videos/{filename}", "filename": filename}

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

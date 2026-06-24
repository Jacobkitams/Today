import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from auth import get_current_user
from models import User

router = APIRouter()

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
    if upload.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {upload.content_type}")
    ext = os.path.splitext(upload.filename or "")[1].lower() or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(dest_dir, filename)
    content = upload.file.read()
    if len(content) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {limit_mb} MB.")
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

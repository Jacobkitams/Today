import sys, os, uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import models, schemas
from database import get_db
from auth import get_current_user
from models import User
from platform_settings_service import get_or_create_platform_settings

router = APIRouter()

@router.get("/public", response_model=schemas.PlatformSettingsPublicResponse)
def get_public_platform_settings(db: Session = Depends(get_db)):
    return get_or_create_platform_settings(db)

VIDEOS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "videos")
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm"}
MAX_VIDEO_SIZE = 200 * 1024 * 1024

os.makedirs(VIDEOS_DIR, exist_ok=True)

HERO_PAGE_KEY_ALIASES = {"commission": "community"}

def _normalize_hero_page_key(page_key: str) -> str:
    return HERO_PAGE_KEY_ALIASES.get(page_key, page_key)

def _get_hero_video_record(db: Session, page_key: str):
    normalized = _normalize_hero_page_key(page_key)
    video = db.query(models.HeroVideo).filter(models.HeroVideo.page_key == normalized).first()
    if not video and normalized == "community":
        video = db.query(models.HeroVideo).filter(models.HeroVideo.page_key == "commission").first()
        if video:
            video.page_key = "community"
            db.commit()
            db.refresh(video)
    return video

def _hero_video_response(video: models.HeroVideo) -> schemas.HeroVideoResponse:
    return schemas.HeroVideoResponse(
        id=video.id,
        page_key=_normalize_hero_page_key(video.page_key),
        video_url=video.video_url,
        original_filename=video.original_filename,
        created_at=video.created_at,
        updated_at=video.updated_at,
    )

def _hero_video_path(video_url: str) -> str:
    filename = os.path.basename(video_url or "")
    return os.path.join(VIDEOS_DIR, filename)

def _delete_hero_video_file(video_url: str) -> None:
    if not video_url:
        return
    path = _hero_video_path(video_url)
    if os.path.isfile(path):
        os.remove(path)

@router.get("/hero-videos", response_model=List[schemas.HeroVideoResponse])
def get_all_hero_videos(db: Session = Depends(get_db)):
    videos = db.query(models.HeroVideo).all()
    by_key = {}
    for video in videos:
        key = _normalize_hero_page_key(video.page_key)
        existing = by_key.get(key)
        if not existing or video.page_key == key:
            by_key[key] = video
    return [_hero_video_response(video) for video in by_key.values()]

@router.get("/hero-videos/{page_key}", response_model=schemas.HeroVideoResponse)
def get_hero_video(page_key: str, db: Session = Depends(get_db)):
    video = _get_hero_video_record(db, page_key)
    if not video:
        raise HTTPException(status_code=404, detail="Hero video not found")
    return _hero_video_response(video)

@router.post("/hero-videos/{page_key}", response_model=schemas.HeroVideoResponse)
async def upload_hero_video(
    page_key: str,
    video: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["super_admin", "admin", "content_editor"]:
        raise HTTPException(status_code=403, detail="Only super_admin can manage hero videos")
        
    if video.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported video format")
        
    content = await video.read()
    if len(content) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=413, detail="File too large")
        
    ext = os.path.splitext(video.filename or "")[1].lower() or ".mp4"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(VIDEOS_DIR, filename)

    page_key = _normalize_hero_page_key(page_key)
    db_video = _get_hero_video_record(db, page_key)
    old_video_url = db_video.video_url if db_video else None

    with open(dest_path, "wb") as f:
        f.write(content)

    video_url = f"/uploads/videos/{filename}"

    if db_video:
        if old_video_url and old_video_url != video_url:
            _delete_hero_video_file(old_video_url)
        db_video.page_key = page_key
        db_video.video_url = video_url
        db_video.original_filename = video.filename
    else:
        db_video = models.HeroVideo(
            page_key=page_key,
            video_url=video_url,
            original_filename=video.filename
        )
        db.add(db_video)
        
    db.commit()
    db.refresh(db_video)
    return _hero_video_response(db_video)

@router.delete("/hero-videos/{page_key}")
def delete_hero_video(
    page_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["super_admin", "admin", "content_editor"]:
        raise HTTPException(status_code=403, detail="Only super_admin can manage hero videos")
        
    db_video = _get_hero_video_record(db, page_key)
    if not db_video:
        raise HTTPException(status_code=404, detail="Hero video not found")

    _delete_hero_video_file(db_video.video_url)
    db.delete(db_video)
    db.commit()
    return {"message": "Hero video removed"}

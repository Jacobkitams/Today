import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
import models, schemas, auth
from database import get_db
from platform_settings_service import get_or_create_platform_settings
from websocket import manager

router = APIRouter()


def _approved_stories_count(db: Session, user_id: int) -> int:
    total = 0
    for model in (models.News, models.Event, models.Innovation):
        total += (
            db.query(func.count(model.id))
            .filter(model.author_id == user_id, model.status == "approved")
            .scalar()
            or 0
        )
    return total

@router.post("/signup", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    settings = get_or_create_platform_settings(db)
    if not settings.allow_registrations:
        raise HTTPException(status_code=403, detail="New registrations are currently disabled")
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = auth.get_password_hash(user.password)
    signup_role = user.role if user.role in ("registered_user",) else "registered_user"
    db_user = models.User(
        email=user.email,
        name=user.name,
        hashed_password=hashed_password,
        role=signup_role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact support.",
        )
    access_token = auth.create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=schemas.UserResponse)
def read_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@router.put("/me", response_model=schemas.UserResponse)
def update_me(
    user_update: schemas.UserUpdate,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if user_update.name is not None:
        current_user.name = user_update.name
    if user_update.email is not None:
        db_user = db.query(models.User).filter(models.User.email == user_update.email, models.User.id != current_user.id).first()
        if db_user:
            raise HTTPException(status_code=400, detail="Email already taken")
        current_user.email = user_update.email
    if user_update.password is not None and user_update.password != "":
        current_user.hashed_password = auth.get_password_hash(user_update.password)
    if user_update.profile_picture is not None:
        current_user.profile_picture = user_update.profile_picture
    
    db.commit()
    db.refresh(current_user)
    
    background_tasks.add_task(manager.broadcast, {
        "type": "USER_UPDATED",
        "payload": {
            "id": current_user.id,
            "name": current_user.name,
            "profile_picture": current_user.profile_picture
        }
    })
    
    return current_user


@router.get("/users/{user_id}/profile", response_model=schemas.PublicUserProfile)
def get_public_profile(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(auth.get_optional_user),
):
    user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.is_active == True,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    stories_count = _approved_stories_count(db, user.id)
    if stories_count == 0:
        raise HTTPException(status_code=404, detail="Profile not available")

    is_following = False
    if current_user and current_user.id != user.id:
        is_following = db.query(models.UserFollow).filter(
            models.UserFollow.follower_id == current_user.id,
            models.UserFollow.following_id == user.id,
        ).first() is not None

    followers_count = (
        db.query(func.count(models.UserFollow.id))
        .filter(models.UserFollow.following_id == user.id)
        .scalar()
        or 0
    )

    return schemas.PublicUserProfile(
        id=user.id,
        name=user.name or "Community member",
        role=user.role,
        member_since=user.created_at,
        stories_count=stories_count,
        bio="IUEA community member",
        is_following=is_following,
        followers_count=followers_count,
    )

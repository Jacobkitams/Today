import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import models, schemas
from database import get_db
from auth import get_current_user
from models import User
import notifications_service

router = APIRouter()

def _content_title(item) -> str:
    if hasattr(item, "title") and item.title:
        return item.title
    if hasattr(item, "first_name"):
        return f"{item.first_name} {item.last_name}".strip() or "Untitled"
    return "Untitled"

def _resolve_author_name(db: Session, author_id: Optional[int]) -> Optional[str]:
    if not author_id:
        return None
    user = db.query(User).filter(User.id == author_id).first()
    return user.name if user else None


def _resolve_author_names(db: Session, author_ids: List[int]) -> dict:
    ids = {author_id for author_id in author_ids if author_id}
    if not ids:
        return {}
    rows = db.query(User.id, User.name).filter(User.id.in_(ids)).all()
    return {row.id: row.name for row in rows}


def _enrich_event(db: Session, item: models.Event) -> schemas.EventResponse:
    data = schemas.EventResponse.model_validate(item)
    if item.author_id:
        return data.model_copy(update={"author_name": _resolve_author_name(db, item.author_id)})
    return data


def _after_pending_content_create(db: Session, content_type: str, item, user: User) -> None:
    if getattr(item, "status", None) != "pending":
        return
    notifications_service.notify_content_pending(db, content_type, _content_title(item), user)
    db.commit()

# Helper: attach author if token present
async def get_author(current_user: Optional[User] = Depends(get_current_user)):
    return current_user

# Single news rows can surface in multiple sections (e.g. innovation in campus + innovation news).
HOME_FEED_NEWS_TYPES = ("news", "innovation", "startup", "alumni")
GENERAL_NEWS_LIST_TYPES = HOME_FEED_NEWS_TYPES

def _parse_types_param(types: Optional[str]) -> Optional[List[str]]:
    if not types:
        return None
    parsed = [value.strip() for value in types.split(",") if value.strip()]
    return parsed or None

def _feed_timestamp(value) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if getattr(value, "tzinfo", None) is None:
        return value.replace(tzinfo=timezone.utc)
    return value

def _resolve_news_type_filter(
    type: Optional[str],
    types: Optional[str],
    all_types: bool,
) -> Optional[List[str]]:
    if type:
        return [type]
    if types:
        return _parse_types_param(types)
    if all_types:
        return list(HOME_FEED_NEWS_TYPES)
    return list(GENERAL_NEWS_LIST_TYPES)

def _approved_news_query(db: Session, news_types: List[str]):
    return db.query(models.News).filter(
        models.News.status == "approved",
        models.News.type.in_(news_types),
    ).order_by(models.News.created_at.desc())

COMMUNITY_ITEM_TYPES = ("news", "committee", "initiative", "report")

def _approved_community_query(db: Session, community_type: Optional[str] = None):
    query = db.query(models.CommunityItem).filter(models.CommunityItem.status == "approved")
    if community_type:
        query = query.filter(models.CommunityItem.type == community_type)
    return query.order_by(models.CommunityItem.created_at.desc())

def _approved_community_news_query(db: Session):
    return _approved_community_query(db, "news")

def _community_to_news_response(item: models.CommunityItem) -> schemas.NewsResponse:
    return schemas.NewsResponse(
        id=item.id,
        title=item.title,
        description=item.description,
        image=item.image,
        likes=item.likes or 0,
        comments_count=item.comments_count or 0,
        author_id=item.author_id,
        author_name=None,
        type="community-news",
        status=item.status,
        video=None,
        created_at=item.created_at,
        source="community",
    )

# --- GET endpoints (public, only approved) ---
@router.get("/news", response_model=List[schemas.NewsResponse])
def get_news(
    limit: Optional[int] = None,
    type: Optional[str] = None,
    types: Optional[str] = None,
    all_types: bool = Query(False, alias="all"),
    include_community: bool = Query(False, alias="include_commission"),
    db: Session = Depends(get_db),
):
    news_types = _resolve_news_type_filter(type, types, all_types)

    if type and not all_types and not types and not include_community:
        q = _approved_news_query(db, news_types)
        if limit is not None and limit > 0:
            q = q.limit(limit)
        return q.all()

    if include_community:
        news_rows = _approved_news_query(db, news_types).all()
        merged = [schemas.NewsResponse.model_validate(row, from_attributes=True) for row in news_rows]
        community_rows = _approved_community_news_query(db).all()
        merged.extend(_community_to_news_response(row) for row in community_rows)
        merged.sort(key=lambda item: _feed_timestamp(item.created_at), reverse=True)
        if limit is not None and limit > 0:
            merged = merged[:limit]
        return merged

    q = _approved_news_query(db, news_types)
    if limit is not None and limit > 0:
        q = q.limit(limit)
    return q.all()

def _feed_item_from_news(row: models.News, author_names: dict) -> dict:
    badge_labels = {
        "news": "News",
        "innovation": "Innovation",
        "startup": "Startup",
        "alumni": "Alumni",
    }
    author_name = row.author_name or author_names.get(row.author_id)
    return {
        "id": row.id,
        "title": row.title,
        "description": row.description,
        "image": row.image,
        "video": row.video,
        "likes": row.likes or 0,
        "comments_count": row.comments_count or 0,
        "author_id": row.author_id,
        "author_name": author_name,
        "source": "news",
        "badge": badge_labels.get(row.type, "News"),
        "created_at": row.created_at,
    }

def _feed_item_from_community(row: models.CommunityItem, author_names: dict) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "description": row.description,
        "image": row.image,
        "video": None,
        "likes": row.likes or 0,
        "comments_count": row.comments_count or 0,
        "author_id": row.author_id,
        "author_name": author_names.get(row.author_id),
        "source": "community",
        "badge": "Community",
        "created_at": row.created_at,
    }

@router.get("/feed", response_model=List[schemas.FeedItemResponse])
def get_home_feed(
    limit: Optional[int] = None,
    types: Optional[str] = None,
    include_community: bool = Query(True, alias="include_commission"),
    db: Session = Depends(get_db),
):
    news_types = _parse_types_param(types) or list(HOME_FEED_NEWS_TYPES)
    news_rows = _approved_news_query(db, news_types).all()

    community_rows = []
    if include_community:
        community_rows = _approved_community_news_query(db).all()

    author_ids = [row.author_id for row in news_rows] + [row.author_id for row in community_rows]
    author_names = _resolve_author_names(db, author_ids)

    items = [_feed_item_from_news(row, author_names) for row in news_rows]
    items.extend(_feed_item_from_community(row, author_names) for row in community_rows)
    items.sort(key=lambda item: _feed_timestamp(item["created_at"]), reverse=True)

    if limit is not None and limit > 0:
        items = items[:limit]
    return items

def _news_comment_payload(db: Session, comment: models.NewsComment, comments_count: int = 0) -> dict:
    author_name = None
    if comment.user_id:
        user = db.query(models.User).filter(models.User.id == comment.user_id).first()
        author_name = user.name if user else None
    return {
        "id": comment.id,
        "news_id": comment.news_id,
        "user_id": comment.user_id,
        "author_name": author_name,
        "message": comment.message,
        "parent_id": comment.parent_id,
        "comments_count": comments_count,
        "replies": [],
        "created_at": comment.created_at,
    }

def _news_comments_tree(db: Session, news_id: int, comments_count: int) -> list:
    all_comments = db.query(models.NewsComment).filter(
        models.NewsComment.news_id == news_id,
    ).order_by(models.NewsComment.created_at.asc()).all()

    by_id = {}
    roots = []
    for comment in all_comments:
        by_id[comment.id] = _news_comment_payload(db, comment, comments_count)

    for comment in all_comments:
        payload = by_id[comment.id]
        if comment.parent_id and comment.parent_id in by_id:
            by_id[comment.parent_id]["replies"].append(payload)
        else:
            roots.append(payload)

    roots.sort(key=lambda c: c["created_at"] or "", reverse=True)
    for payload in by_id.values():
        payload["replies"].sort(key=lambda c: c["created_at"] or "")
    return roots

def _can_reply_to_news(db: Session, item: models.News, user: User, news_id: int) -> bool:
    if item.author_id == user.id:
        return True
    return db.query(models.NewsComment).filter(
        models.NewsComment.news_id == news_id,
        models.NewsComment.user_id == user.id,
    ).first() is not None

@router.get("/my-news", response_model=List[schemas.MyNewsResponse])
def get_my_news(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    items = db.query(models.News).filter(
        models.News.author_id == current_user.id
    ).order_by(models.News.created_at.desc()).all()

    result = []
    for item in items:
        comments = db.query(models.NewsComment).filter(
            models.NewsComment.news_id == item.id
        ).all()
        result.append({
            "id": item.id,
            "title": item.title,
            "description": item.description,
            "image": item.image,
            "likes": item.likes or 0,
            "status": item.status,
            "created_at": item.created_at,
            "comments_count": len(comments),
            "comments": _news_comments_tree(db, item.id, len(comments)),
        })
    return result

@router.get("/events", response_model=List[schemas.EventResponse])
def get_events(limit: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.Event).filter(models.Event.status == "approved").order_by(models.Event.created_at.desc())
    if limit is not None and limit > 0:
        q = q.limit(limit)
    items = q.all()
    author_names = _resolve_author_names(db, [item.author_id for item in items])
    result = []
    for item in items:
        data = schemas.EventResponse.model_validate(item)
        if item.author_id:
            data = data.model_copy(update={"author_name": author_names.get(item.author_id)})
        result.append(data)
    return result

@router.get("/innovations", response_model=List[schemas.InnovationResponse])
def get_innovations(db: Session = Depends(get_db)):
    return db.query(models.Innovation).filter(models.Innovation.status == "approved").order_by(models.Innovation.created_at.desc()).all()

@router.get("/startups", response_model=List[schemas.StartupResponse])
def get_startups(db: Session = Depends(get_db)):
    return db.query(models.Startup).filter(models.Startup.status == "approved").order_by(models.Startup.created_at.desc()).all()

@router.get("/alumni", response_model=List[schemas.AlumniResponse])
def get_alumni(db: Session = Depends(get_db)):
    return db.query(models.AlumniProfile).filter(models.AlumniProfile.status == "approved").order_by(models.AlumniProfile.created_at.desc()).all()

@router.get("/donations", response_model=List[schemas.DonationResponse])
def get_donations(db: Session = Depends(get_db)):
    return db.query(models.Donation).order_by(models.Donation.created_at.desc()).all()

@router.get("/donation-tiers", response_model=List[schemas.DonationTierResponse])
def get_donation_tiers(db: Session = Depends(get_db)):
    return db.query(models.DonationTier).filter(models.DonationTier.status == "approved").order_by(models.DonationTier.sort_order, models.DonationTier.id).all()

@router.get("/endowment-stats", response_model=List[schemas.EndowmentStatResponse])
def get_endowment_stats(db: Session = Depends(get_db)):
    return db.query(models.EndowmentStat).filter(models.EndowmentStat.status == "approved").order_by(models.EndowmentStat.sort_order, models.EndowmentStat.id).all()

@router.get("/endowment-campaigns", response_model=List[schemas.EndowmentCampaignResponse])
def get_endowment_campaigns(limit: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.EndowmentCampaign).filter(models.EndowmentCampaign.status == "approved").order_by(models.EndowmentCampaign.created_at.desc())
    if limit is not None and limit > 0:
        q = q.limit(limit)
    return q.all()

@router.get("/endowment-info", response_model=List[schemas.EndowmentInfoResponse])
def get_endowment_info(db: Session = Depends(get_db)):
    return db.query(models.EndowmentInfo).filter(models.EndowmentInfo.status == "approved").order_by(models.EndowmentInfo.created_at.desc()).all()

@router.post("/endowment-campaigns/{item_id}/like", response_model=schemas.LikeResponse)
def like_endowment_campaign(item_id: int, db: Session = Depends(get_db)):
    return _increment_likes(db, models.EndowmentCampaign, item_id)

@router.get("/community", response_model=List[schemas.CommunityResponse])
@router.get("/commission", response_model=List[schemas.CommunityResponse], include_in_schema=False)
def get_community(
    type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if type and type not in COMMUNITY_ITEM_TYPES:
        raise HTTPException(status_code=400, detail="Invalid community type")
    return _approved_community_query(db, type).all()

@router.get("/research-areas", response_model=List[schemas.ResearchAreaResponse])
def get_research_areas(db: Session = Depends(get_db)):
    return db.query(models.ResearchArea).filter(models.ResearchArea.status == "approved").all()

@router.get("/publications", response_model=List[schemas.PublicationResponse])
def get_publications(db: Session = Depends(get_db)):
    return db.query(models.Publication).filter(models.Publication.status == "approved").order_by(models.Publication.created_at.desc()).all()

@router.get("/research-labs", response_model=List[schemas.ResearchLabResponse])
def get_research_labs(db: Session = Depends(get_db)):
    return db.query(models.ResearchLab).filter(models.ResearchLab.status == "approved").all()

@router.get("/tech-park", response_model=List[schemas.TechParkResponse])
def get_tech_park(db: Session = Depends(get_db)):
    return db.query(models.TechParkItem).filter(models.TechParkItem.status == "approved").all()

# --- POST endpoints (require auth) ---
@router.post("/news", response_model=schemas.NewsResponse)
def create_news(item: schemas.NewsCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.News(**item.dict(), author_id=current_user.id, status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    _after_pending_content_create(db, "news", db_item, current_user)
    return db_item

@router.post("/events", response_model=schemas.EventResponse)
def create_event(item: schemas.EventCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.Event(**item.dict(), author_id=current_user.id, status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    _after_pending_content_create(db, "events", db_item, current_user)
    return db_item

@router.post("/innovations", response_model=schemas.InnovationResponse)
def create_innovation(item: schemas.InnovationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.Innovation(**item.dict(), author_id=current_user.id, status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    _after_pending_content_create(db, "innovations", db_item, current_user)
    return db_item

@router.post("/startups", response_model=schemas.StartupResponse)
def create_startup(item: schemas.StartupCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.Startup(**item.dict(), author_id=current_user.id, status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    _after_pending_content_create(db, "startups", db_item, current_user)
    return db_item

@router.post("/alumni", response_model=schemas.AlumniResponse)
def create_alumni(item: schemas.AlumniCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.AlumniProfile(**item.dict(), author_id=current_user.id, status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    _after_pending_content_create(db, "alumni", db_item, current_user)
    return db_item

@router.post("/donations", response_model=schemas.DonationResponse)
def create_donation(item: schemas.DonationCreate, db: Session = Depends(get_db)):
    db_item = models.Donation(**item.dict())
    db.add(db_item); db.commit(); db.refresh(db_item)
    return db_item

@router.post("/donation-tiers", response_model=schemas.DonationTierResponse)
def create_donation_tier(item: schemas.DonationTierCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.DonationTier(**item.dict(), status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    return db_item

@router.post("/endowment-stats", response_model=schemas.EndowmentStatResponse)
def create_endowment_stat(item: schemas.EndowmentStatCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.EndowmentStat(**item.dict(), status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    return db_item

@router.post("/endowment-campaigns", response_model=schemas.EndowmentCampaignResponse)
def create_endowment_campaign(item: schemas.EndowmentCampaignCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.EndowmentCampaign(**item.dict(), status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    return db_item

@router.post("/endowment-info", response_model=schemas.EndowmentInfoResponse)
def create_endowment_info(item: schemas.EndowmentInfoCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.EndowmentInfo(**item.dict(), status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    return db_item

@router.post("/community", response_model=schemas.CommunityResponse)
@router.post("/commission", response_model=schemas.CommunityResponse, include_in_schema=False)
def create_community(item: schemas.CommunityCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.CommunityItem(**item.dict(), author_id=current_user.id, status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    _after_pending_content_create(db, "community", db_item, current_user)
    return db_item

@router.post("/research-areas", response_model=schemas.ResearchAreaResponse)
def create_research_area(item: schemas.ResearchAreaCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.ResearchArea(**item.dict(), author_id=current_user.id, status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    return db_item

@router.post("/publications", response_model=schemas.PublicationResponse)
def create_publication(item: schemas.PublicationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.Publication(**item.dict(), status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    _after_pending_content_create(db, "publications", db_item, current_user)
    return db_item

@router.post("/research-labs", response_model=schemas.ResearchLabResponse)
def create_research_lab(item: schemas.ResearchLabCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.ResearchLab(**item.dict(), status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    return db_item

@router.post("/tech-park", response_model=schemas.TechParkResponse)
def create_tech_park(item: schemas.TechParkCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status = "approved" if current_user.role in ["super_admin", "content_editor", "admin"] else "pending"
    db_item = models.TechParkItem(**item.dict(), status=status)
    db.add(db_item); db.commit(); db.refresh(db_item)
    return db_item

# --- ENGAGEMENT (likes & comments) ---
def _author_name(db: Session, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    user = db.query(models.User).filter(models.User.id == user_id).first()
    return user.name if user else None

def _comment_payload(db: Session, comment, fk_name: str, comments_count: int) -> dict:
    return {
        "id": comment.id,
        fk_name: getattr(comment, fk_name),
        "user_id": comment.user_id,
        "author_name": _author_name(db, comment.user_id),
        "message": comment.message,
        "comments_count": comments_count,
        "created_at": comment.created_at,
    }

def _get_approved_item(db: Session, model, item_id: int, not_found: str):
    item = db.query(model).filter(model.id == item_id, model.status == "approved").first()
    if not item:
        raise HTTPException(status_code=404, detail=not_found)
    return item

def _post_content_comment(
    db: Session,
    current_user: User,
    item,
    comment_model,
    fk_name: str,
    item_id: int,
    message: str,
    content_type: str,
):
    db_comment = comment_model(**{fk_name: item_id, "user_id": current_user.id, "message": message})
    db.add(db_comment)
    item.comments_count = (item.comments_count or 0) + 1
    db.commit()
    db.refresh(db_comment)
    db.refresh(item)
    author_id = getattr(item, "author_id", None)
    notifications_service.notify_content_comment(
        db,
        author_id,
        current_user,
        content_type,
        _content_title(item),
        message,
    )
    db.commit()
    return _comment_payload(db, db_comment, fk_name, item.comments_count)

def _list_content_comments(db: Session, item, comment_model, fk_name: str, item_id: int):
    comments = db.query(comment_model).filter(
        getattr(comment_model, fk_name) == item_id,
    ).order_by(comment_model.created_at.desc()).all()
    count = item.comments_count or 0
    return [_comment_payload(db, c, fk_name, count) for c in comments]

def _increment_likes(db: Session, model, item_id: int):
    item = db.query(model).filter(model.id == item_id, model.status == "approved").first()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    item.likes = (item.likes or 0) + 1
    db.commit()
    db.refresh(item)
    return {"likes": item.likes}

@router.post("/news/{item_id}/like", response_model=schemas.LikeResponse)
def like_news(item_id: int, db: Session = Depends(get_db)):
    return _increment_likes(db, models.News, item_id)

@router.post("/news/{news_id}/comment", response_model=schemas.NewsCommentResponse)
def comment_news(
    news_id: int,
    data: schemas.NewsCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")

    item = db.query(models.News).filter(models.News.id == news_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="News item not found")

    parent_id = data.parent_id
    parent_comment = None
    if parent_id:
        parent_comment = db.query(models.NewsComment).filter(
            models.NewsComment.id == parent_id,
            models.NewsComment.news_id == news_id,
        ).first()
        if not parent_comment:
            raise HTTPException(status_code=404, detail="Parent comment not found")
        if not _can_reply_to_news(db, item, current_user, news_id):
            raise HTTPException(
                status_code=403,
                detail="Only the story author or existing commenters can reply",
            )
    elif item.status != "approved":
        raise HTTPException(status_code=404, detail="News item not found")

    db_comment = models.NewsComment(
        news_id=news_id,
        user_id=current_user.id,
        parent_id=parent_id,
        message=message,
    )
    db.add(db_comment)
    item.comments_count = (item.comments_count or 0) + 1
    db.commit()
    db.refresh(db_comment)
    db.refresh(item)
    parent_author_id = parent_comment.user_id if parent_comment else None
    notifications_service.notify_content_comment(
        db,
        item.author_id,
        current_user,
        "news",
        _content_title(item),
        message,
        parent_author_id=parent_author_id,
    )
    db.commit()
    return _news_comment_payload(db, db_comment, item.comments_count)

@router.get("/news/{news_id}/comments", response_model=List[schemas.NewsCommentResponse])
def get_news_comments(news_id: int, db: Session = Depends(get_db)):
    item = db.query(models.News).filter(
        models.News.id == news_id,
        models.News.status == "approved",
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="News item not found")

    count = item.comments_count or db.query(models.NewsComment).filter(
        models.NewsComment.news_id == news_id,
    ).count()
    return _news_comments_tree(db, news_id, count)

@router.post("/events/{item_id}/like", response_model=schemas.LikeResponse)
def like_event(item_id: int, db: Session = Depends(get_db)):
    return _increment_likes(db, models.Event, item_id)

def _event_comment_payload(db: Session, comment: models.EventComment, comments_count: int) -> dict:
    author_name = None
    if comment.user_id:
        user = db.query(models.User).filter(models.User.id == comment.user_id).first()
        author_name = user.name if user else None
    return {
        "id": comment.id,
        "event_id": comment.event_id,
        "user_id": comment.user_id,
        "author_name": author_name,
        "message": comment.message,
        "comments_count": comments_count,
        "created_at": comment.created_at,
    }

@router.post("/events/{event_id}/comment", response_model=schemas.EventCommentResponse)
def comment_event(
    event_id: int,
    data: schemas.EventCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")

    item = db.query(models.Event).filter(
        models.Event.id == event_id,
        models.Event.status == "approved",
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Event not found")

    db_comment = models.EventComment(
        event_id=event_id,
        user_id=current_user.id,
        message=message,
    )
    db.add(db_comment)
    item.comments_count = (item.comments_count or 0) + 1
    db.commit()
    db.refresh(db_comment)
    db.refresh(item)
    notifications_service.notify_content_comment(
        db,
        item.author_id,
        current_user,
        "events",
        _content_title(item),
        message,
    )
    db.commit()
    return _event_comment_payload(db, db_comment, item.comments_count)

@router.get("/events/{event_id}/comments", response_model=List[schemas.EventCommentResponse])
def get_event_comments(event_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Event).filter(
        models.Event.id == event_id,
        models.Event.status == "approved",
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Event not found")

    comments = db.query(models.EventComment).filter(
        models.EventComment.event_id == event_id,
    ).order_by(models.EventComment.created_at.desc()).all()

    count = item.comments_count or 0
    return [_event_comment_payload(db, c, count) for c in comments]

@router.post("/innovations/{item_id}/like", response_model=schemas.LikeResponse)
def like_innovation(item_id: int, db: Session = Depends(get_db)):
    return _increment_likes(db, models.Innovation, item_id)

@router.post("/startups/{item_id}/like", response_model=schemas.LikeResponse)
def like_startup(item_id: int, db: Session = Depends(get_db)):
    return _increment_likes(db, models.Startup, item_id)

@router.post("/alumni/{alumni_id}/like", response_model=schemas.LikeResponse)
def like_alumni(alumni_id: int, db: Session = Depends(get_db)):
    return _increment_likes(db, models.AlumniProfile, alumni_id)

def _alumni_comment_payload(db: Session, comment: models.AlumniComment, comments_count: int) -> dict:
    return {
        "id": comment.id,
        "alumni_id": comment.alumni_id,
        "user_id": comment.user_id,
        "author_name": _author_name(db, comment.user_id),
        "message": comment.message,
        "comments_count": comments_count,
        "created_at": comment.created_at,
    }

@router.post("/alumni/{alumni_id}/comment", response_model=schemas.AlumniCommentResponse)
def comment_alumni(
    alumni_id: int,
    data: schemas.AlumniCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")

    profile = db.query(models.AlumniProfile).filter(
        models.AlumniProfile.id == alumni_id,
        models.AlumniProfile.status == "approved",
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Alumni profile not found")

    db_comment = models.AlumniComment(
        alumni_id=alumni_id,
        user_id=current_user.id,
        message=message,
    )
    db.add(db_comment)
    profile.comments_count = (profile.comments_count or 0) + 1
    db.commit()
    db.refresh(db_comment)
    db.refresh(profile)
    notifications_service.notify_content_comment(
        db,
        profile.author_id,
        current_user,
        "alumni",
        _content_title(profile),
        message,
    )
    db.commit()

    return _alumni_comment_payload(db, db_comment, profile.comments_count)

@router.get("/alumni/{alumni_id}/comments", response_model=List[schemas.AlumniCommentResponse])
def get_alumni_comments(alumni_id: int, db: Session = Depends(get_db)):
    profile = db.query(models.AlumniProfile).filter(
        models.AlumniProfile.id == alumni_id,
        models.AlumniProfile.status == "approved",
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Alumni profile not found")

    comments = db.query(models.AlumniComment).filter(
        models.AlumniComment.alumni_id == alumni_id,
    ).order_by(models.AlumniComment.created_at.desc()).all()

    count = profile.comments_count or 0
    return [_alumni_comment_payload(db, c, count) for c in comments]

@router.post("/innovations/{item_id}/comment", response_model=schemas.InnovationCommentResponse)
def comment_innovation(
    item_id: int,
    data: schemas.InnovationCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")
    item = _get_approved_item(db, models.Innovation, item_id, "Innovation not found")
    return _post_content_comment(db, current_user, item, models.InnovationComment, "innovation_id", item_id, message, "innovations")

@router.get("/innovations/{item_id}/comments", response_model=List[schemas.InnovationCommentResponse])
def get_innovation_comments(item_id: int, db: Session = Depends(get_db)):
    item = _get_approved_item(db, models.Innovation, item_id, "Innovation not found")
    return _list_content_comments(db, item, models.InnovationComment, "innovation_id", item_id)

@router.post("/startups/{item_id}/comment", response_model=schemas.StartupCommentResponse)
def comment_startup(
    item_id: int,
    data: schemas.StartupCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")
    item = _get_approved_item(db, models.Startup, item_id, "Startup not found")
    return _post_content_comment(db, current_user, item, models.StartupComment, "startup_id", item_id, message, "startups")

@router.get("/startups/{item_id}/comments", response_model=List[schemas.StartupCommentResponse])
def get_startup_comments(item_id: int, db: Session = Depends(get_db)):
    item = _get_approved_item(db, models.Startup, item_id, "Startup not found")
    return _list_content_comments(db, item, models.StartupComment, "startup_id", item_id)

@router.post("/community/{item_id}/like", response_model=schemas.LikeResponse)
@router.post("/commission/{item_id}/like", response_model=schemas.LikeResponse, include_in_schema=False)
def like_community(item_id: int, db: Session = Depends(get_db)):
    return _increment_likes(db, models.CommunityItem, item_id)

@router.post("/community/{item_id}/comment", response_model=schemas.CommunityCommentResponse)
@router.post("/commission/{item_id}/comment", response_model=schemas.CommunityCommentResponse, include_in_schema=False)
def comment_community(
    item_id: int,
    data: schemas.CommunityCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")
    item = _get_approved_item(db, models.CommunityItem, item_id, "Community item not found")
    return _post_content_comment(db, current_user, item, models.CommunityComment, "community_id", item_id, message, "community")

@router.get("/community/{item_id}/comments", response_model=List[schemas.CommunityCommentResponse])
@router.get("/commission/{item_id}/comments", response_model=List[schemas.CommunityCommentResponse], include_in_schema=False)
def get_community_comments(item_id: int, db: Session = Depends(get_db)):
    item = _get_approved_item(db, models.CommunityItem, item_id, "Community item not found")
    return _list_content_comments(db, item, models.CommunityComment, "community_id", item_id)

@router.post("/research-areas/{item_id}/comment", response_model=schemas.ResearchAreaCommentResponse)
def comment_research_area(
    item_id: int,
    data: schemas.ResearchAreaCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")
    item = _get_approved_item(db, models.ResearchArea, item_id, "Research area not found")
    return _post_content_comment(db, current_user, item, models.ResearchAreaComment, "research_area_id", item_id, message, "research-areas")

@router.get("/research-areas/{item_id}/comments", response_model=List[schemas.ResearchAreaCommentResponse])
def get_research_area_comments(item_id: int, db: Session = Depends(get_db)):
    item = _get_approved_item(db, models.ResearchArea, item_id, "Research area not found")
    return _list_content_comments(db, item, models.ResearchAreaComment, "research_area_id", item_id)

@router.post("/publications/{item_id}/comment", response_model=schemas.PublicationCommentResponse)
def comment_publication(
    item_id: int,
    data: schemas.PublicationCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")
    item = _get_approved_item(db, models.Publication, item_id, "Publication not found")
    return _post_content_comment(db, current_user, item, models.PublicationComment, "publication_id", item_id, message, "publications")

@router.get("/publications/{item_id}/comments", response_model=List[schemas.PublicationCommentResponse])
def get_publication_comments(item_id: int, db: Session = Depends(get_db)):
    item = _get_approved_item(db, models.Publication, item_id, "Publication not found")
    return _list_content_comments(db, item, models.PublicationComment, "publication_id", item_id)

@router.post("/research-labs/{item_id}/comment", response_model=schemas.ResearchLabCommentResponse)
def comment_research_lab(
    item_id: int,
    data: schemas.ResearchLabCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")
    item = _get_approved_item(db, models.ResearchLab, item_id, "Research lab not found")
    return _post_content_comment(db, current_user, item, models.ResearchLabComment, "research_lab_id", item_id, message, "research-labs")

@router.get("/research-labs/{item_id}/comments", response_model=List[schemas.ResearchLabCommentResponse])
def get_research_lab_comments(item_id: int, db: Session = Depends(get_db)):
    item = _get_approved_item(db, models.ResearchLab, item_id, "Research lab not found")
    return _list_content_comments(db, item, models.ResearchLabComment, "research_lab_id", item_id)

@router.post("/tech-park/{item_id}/like", response_model=schemas.LikeResponse)
def like_tech_park(item_id: int, db: Session = Depends(get_db)):
    return _increment_likes(db, models.TechParkItem, item_id)

@router.post("/tech-park/{item_id}/comment", response_model=schemas.TechParkCommentResponse)
def comment_tech_park(
    item_id: int,
    data: schemas.TechParkCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Comment message is required")
    item = _get_approved_item(db, models.TechParkItem, item_id, "Tech Park item not found")
    return _post_content_comment(db, current_user, item, models.TechParkComment, "tech_park_id", item_id, message, "tech-park")

@router.get("/tech-park/{item_id}/comments", response_model=List[schemas.TechParkCommentResponse])
def get_tech_park_comments(item_id: int, db: Session = Depends(get_db)):
    item = _get_approved_item(db, models.TechParkItem, item_id, "Tech Park item not found")
    return _list_content_comments(db, item, models.TechParkComment, "tech_park_id", item_id)

# --- SAVED CONTENT (bookmarks) ---
VALID_SAVE_TYPES = {
    "news",
    "events",
    "innovations",
    "startups",
    "alumni",
    "community",
    "research-areas",
    "publications",
    "research-labs",
    "tech-park",
}

_SAVE_MODELS = {
    "news": models.News,
    "events": models.Event,
    "innovations": models.Innovation,
    "startups": models.Startup,
    "alumni": models.AlumniProfile,
    "community": models.CommunityItem,
    "research-areas": models.ResearchArea,
    "publications": models.Publication,
    "research-labs": models.ResearchLab,
    "tech-park": models.TechParkItem,
}

_SAVE_SCHEMAS = {
    "news": schemas.NewsResponse,
    "events": schemas.EventResponse,
    "innovations": schemas.InnovationResponse,
    "startups": schemas.StartupResponse,
    "alumni": schemas.AlumniResponse,
    "community": schemas.CommunityResponse,
    "research-areas": schemas.ResearchAreaResponse,
    "publications": schemas.PublicationResponse,
    "research-labs": schemas.ResearchLabResponse,
    "tech-park": schemas.TechParkResponse,
}

def _normalize_save_type(content_type: str) -> str:
    normalized = (content_type or "").strip().lower()
    if normalized == "techpark":
        normalized = "tech-park"
    if normalized == "commission":
        normalized = "community"
    return normalized

def _legacy_save_type_aliases(content_type: str) -> tuple[str, ...]:
    if content_type == "community":
        return ("community", "commission")
    return (content_type,)

def _get_saveable_item(db: Session, content_type: str, content_id: int):
    model = _SAVE_MODELS.get(content_type)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid content type")
    item = db.query(model).filter(model.id == content_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    if hasattr(item, "status") and item.status != "approved":
        raise HTTPException(status_code=404, detail="Content not found")
    return item

def _serialize_saved_item(content_type: str, item) -> dict:
    schema_cls = _SAVE_SCHEMAS[content_type]
    return schema_cls.model_validate(item).model_dump()

def _saved_count(db: Session, user_id: int) -> int:
    return db.query(models.SavedItem).filter(models.SavedItem.user_id == user_id).count()

def _followed_count(db: Session, user_id: int) -> int:
    return db.query(models.FollowedItem).filter(models.FollowedItem.user_id == user_id).count()

@router.post("/save", response_model=schemas.SaveToggleResponse)
def toggle_save(
    data: schemas.SaveCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content_type = _normalize_save_type(data.content_type)
    if content_type not in VALID_SAVE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid content type")

    _get_saveable_item(db, content_type, data.content_id)

    existing = db.query(models.SavedItem).filter(
        models.SavedItem.user_id == current_user.id,
        models.SavedItem.content_type.in_(_legacy_save_type_aliases(content_type)),
        models.SavedItem.content_id == data.content_id,
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {
            "saved": False,
            "content_type": content_type,
            "content_id": data.content_id,
            "count": _saved_count(db, current_user.id),
        }

    db.add(models.SavedItem(
        user_id=current_user.id,
        content_type=content_type,
        content_id=data.content_id,
    ))
    db.commit()
    return {
        "saved": True,
        "content_type": content_type,
        "content_id": data.content_id,
        "count": _saved_count(db, current_user.id),
    }

@router.get("/saved/ids", response_model=List[schemas.SavedIdResponse])
def get_saved_ids(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(models.SavedItem).filter(
        models.SavedItem.user_id == current_user.id,
    ).order_by(models.SavedItem.created_at.desc()).all()
    return [
        {
            "content_type": _normalize_save_type(row.content_type),
            "content_id": row.content_id,
        }
        for row in rows
    ]

@router.get("/saved", response_model=List[schemas.SavedItemResponse])
def get_saved_items(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(models.SavedItem).filter(
        models.SavedItem.user_id == current_user.id,
    ).order_by(models.SavedItem.created_at.desc()).all()

    result = []
    for row in rows:
        content_type = _normalize_save_type(row.content_type)
        if content_type not in _SAVE_MODELS:
            continue
        item = db.query(_SAVE_MODELS[content_type]).filter(
            _SAVE_MODELS[content_type].id == row.content_id,
        ).first()
        if not item:
            continue
        if hasattr(item, "status") and item.status != "approved":
            continue
        result.append({
            "content_type": content_type,
            "content_id": row.content_id,
            "saved_at": row.created_at,
            "item": _serialize_saved_item(content_type, item),
        })
    return result

@router.post("/follow-item", response_model=schemas.FollowItemToggleResponse)
def toggle_follow_item(
    data: schemas.SaveCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content_type = _normalize_save_type(data.content_type)
    if content_type not in VALID_SAVE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid content type")

    _get_saveable_item(db, content_type, data.content_id)

    existing = db.query(models.FollowedItem).filter(
        models.FollowedItem.user_id == current_user.id,
        models.FollowedItem.content_type.in_(_legacy_save_type_aliases(content_type)),
        models.FollowedItem.content_id == data.content_id,
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {
            "following": False,
            "content_type": content_type,
            "content_id": data.content_id,
            "count": _followed_count(db, current_user.id),
        }

    db.add(models.FollowedItem(
        user_id=current_user.id,
        content_type=content_type,
        content_id=data.content_id,
    ))
    db.commit()
    return {
        "following": True,
        "content_type": content_type,
        "content_id": data.content_id,
        "count": _followed_count(db, current_user.id),
    }

@router.get("/followed/ids", response_model=List[schemas.SavedIdResponse])
def get_followed_ids(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(models.FollowedItem).filter(
        models.FollowedItem.user_id == current_user.id,
    ).order_by(models.FollowedItem.created_at.desc()).all()
    return [
        {
            "content_type": _normalize_save_type(row.content_type),
            "content_id": row.content_id,
        }
        for row in rows
    ]

@router.get("/followed", response_model=List[schemas.FollowedItemResponse])
def get_followed_items(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(models.FollowedItem).filter(
        models.FollowedItem.user_id == current_user.id,
    ).order_by(models.FollowedItem.created_at.desc()).all()

    result = []
    for row in rows:
        content_type = _normalize_save_type(row.content_type)
        if content_type not in _SAVE_MODELS:
            continue
        item = db.query(_SAVE_MODELS[content_type]).filter(
            _SAVE_MODELS[content_type].id == row.content_id,
        ).first()
        if not item:
            continue
        if hasattr(item, "status") and item.status != "approved":
            continue
        result.append({
            "content_type": content_type,
            "content_id": row.content_id,
            "followed_at": row.created_at,
            "item": _serialize_saved_item(content_type, item),
        })
    return result

def _followers_count(db: Session, user_id: int) -> int:
    return (
        db.query(func.count(models.UserFollow.id))
        .filter(models.UserFollow.following_id == user_id)
        .scalar()
        or 0
    )

@router.post("/follow/{user_id}", response_model=schemas.FollowToggleResponse)
def toggle_follow(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")

    target = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(models.UserFollow).filter(
        models.UserFollow.follower_id == current_user.id,
        models.UserFollow.following_id == user_id,
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        following = False
    else:
        db.add(models.UserFollow(follower_id=current_user.id, following_id=user_id))
        db.commit()
        following = True

    return {
        "following": following,
        "user_id": user_id,
        "followers_count": _followers_count(db, user_id),
    }

@router.get("/following/ids", response_model=List[int])
def get_following_ids(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(models.UserFollow.following_id).filter(
        models.UserFollow.follower_id == current_user.id,
    ).all()
    return [row[0] for row in rows]

_FOLLOW_CONTENT_TYPES = {
    "news": models.News,
    "events": models.Event,
    "innovations": models.Innovation,
    "startups": models.Startup,
    "alumni": models.AlumniProfile,
    "community": models.CommunityItem,
}

@router.get("/following/feed", response_model=List[schemas.FollowedItemResponse])
def get_following_feed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    following_ids = [
        row[0]
        for row in db.query(models.UserFollow.following_id).filter(
            models.UserFollow.follower_id == current_user.id,
        ).all()
    ]
    if not following_ids:
        return []

    follow_created = {
        row.following_id: row.created_at
        for row in db.query(models.UserFollow).filter(
            models.UserFollow.follower_id == current_user.id,
            models.UserFollow.following_id.in_(following_ids),
        ).all()
    }

    feed = []
    for content_type, model in _FOLLOW_CONTENT_TYPES.items():
        query = db.query(model).filter(model.author_id.in_(following_ids))
        if hasattr(model, "status"):
            query = query.filter(model.status == "approved")
        for item in query.all():
            followed_at = follow_created.get(item.author_id)
            feed.append({
                "content_type": content_type,
                "content_id": item.id,
                "followed_at": followed_at,
                "item": _serialize_saved_item(content_type, item),
                "_sort_at": getattr(item, "created_at", None) or followed_at,
            })

    feed.sort(key=lambda row: row["_sort_at"] or "", reverse=True)
    for row in feed:
        row.pop("_sort_at", None)
    return feed

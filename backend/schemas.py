from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ---------- USER ----------
class UserBase(BaseModel):
    email: str
    name: str

class UserCreate(UserBase):
    password: str
    role: Optional[str] = "public_visitor"

class UserResponse(UserBase):
    id: int
    role: str
    is_active: bool
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class UserRoleUpdate(BaseModel):
    role: str

class UserStatusUpdate(BaseModel):
    is_active: bool

class PublicUserProfile(BaseModel):
    id: int
    name: str
    role: str
    member_since: Optional[datetime] = None
    stories_count: int = 0
    bio: str = "IUEA community member"
    is_following: bool = False
    followers_count: int = 0

# ---------- AUTH ----------
class Token(BaseModel):
    access_token: str
    token_type: str

# ---------- CONTENT BASE ----------
class ContentBase(BaseModel):
    title: str
    description: Optional[str] = None
    image: Optional[str] = None

# ---------- NEWS ----------
class NewsCreate(ContentBase):
    author_name: Optional[str] = None
    video: Optional[str] = None
    type: Optional[str] = "news"

class NewsResponse(ContentBase):
    id: int
    likes: int
    comments_count: int = 0
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    type: str
    status: str
    video: Optional[str] = None
    source: Optional[str] = "news"
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class FeedItemResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    image: Optional[str] = None
    video: Optional[str] = None
    likes: int = 0
    comments_count: int = 0
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    source: str
    badge: str
    created_at: Optional[datetime] = None

class NewsCommentCreate(BaseModel):
    message: str
    parent_id: Optional[int] = None

class NewsCommentResponse(BaseModel):
    id: int
    news_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    parent_id: Optional[int] = None
    comments_count: int = 0
    replies: List["NewsCommentResponse"] = []
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class MyNewsResponse(ContentBase):
    id: int
    likes: int
    status: str
    created_at: Optional[datetime] = None
    comments_count: int
    comments: List["NewsCommentResponse"] = []
    class Config:
        from_attributes = True

# ---------- EVENT ----------
class EventCreate(ContentBase):
    date: Optional[str] = None
    location: Optional[str] = None
    video: Optional[str] = None

class EventResponse(ContentBase):
    id: int
    likes: int
    comments_count: int = 0
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    date: Optional[str] = None
    location: Optional[str] = None
    attendees: int
    status: str
    video: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class EventCommentCreate(BaseModel):
    message: str

class EventCommentResponse(BaseModel):
    id: int
    event_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    comments_count: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- INNOVATION ----------
class InnovationCreate(ContentBase):
    author_name: Optional[str] = None
    video: Optional[str] = None

class InnovationResponse(ContentBase):
    id: int
    likes: int
    comments_count: int = 0
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    status: str
    video: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class InnovationCommentCreate(BaseModel):
    message: str

class InnovationCommentResponse(BaseModel):
    id: int
    innovation_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    comments_count: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- STARTUP ----------
class StartupCreate(ContentBase):
    founder_name: Optional[str] = None
    video: Optional[str] = None

class StartupResponse(ContentBase):
    id: int
    likes: int
    comments_count: int = 0
    founder_name: Optional[str] = None
    status: str
    video: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class StartupCommentCreate(BaseModel):
    message: str

class StartupCommentResponse(BaseModel):
    id: int
    startup_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    comments_count: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- ALUMNI ----------
class AlumniCreate(BaseModel):
    first_name: str
    last_name: str
    year: Optional[str] = None
    role: Optional[str] = None
    achievement: Optional[str] = None
    image: Optional[str] = None

class AlumniResponse(AlumniCreate):
    id: int
    likes: int = 0
    comments_count: int = 0
    status: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class AlumniCommentCreate(BaseModel):
    message: str

class AlumniCommentResponse(BaseModel):
    id: int
    alumni_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    comments_count: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class LikeResponse(BaseModel):
    likes: int

# ---------- DONATION ----------
class DonationCreate(BaseModel):
    name: str
    amount: float
    message: Optional[str] = None

class DonationResponse(DonationCreate):
    id: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- DONATION TIER ----------
class DonationTierCreate(BaseModel):
    name: str
    amount: str
    description: Optional[str] = None
    icon: Optional[str] = "gift"
    featured: Optional[bool] = False
    sort_order: Optional[int] = 0

class DonationTierResponse(DonationTierCreate):
    id: int
    status: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- ENDOWMENT STAT ----------
class EndowmentStatCreate(BaseModel):
    label: str
    value: str
    sort_order: Optional[int] = 0

class EndowmentStatResponse(EndowmentStatCreate):
    id: int
    status: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- ENDOWMENT CAMPAIGN ----------
class EndowmentCampaignCreate(BaseModel):
    title: str
    description: Optional[str] = None
    goal_amount: Optional[str] = None
    raised_amount: Optional[str] = None
    image: Optional[str] = None

class EndowmentCampaignResponse(EndowmentCampaignCreate):
    id: int
    status: str
    likes: int = 0
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- ENDOWMENT INFO ----------
class EndowmentInfoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    image: Optional[str] = None

class EndowmentInfoResponse(EndowmentInfoCreate):
    id: int
    status: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- COMMISSION ----------
class CommissionCreate(ContentBase):
    type: Optional[str] = "news"

class CommissionResponse(ContentBase):
    id: int
    likes: int
    comments_count: int = 0
    type: str
    status: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class CommissionCommentCreate(BaseModel):
    message: str

class CommissionCommentResponse(BaseModel):
    id: int
    commission_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    comments_count: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- RESEARCH AREA ----------
class ResearchAreaCreate(BaseModel):
    name: str
    description: Optional[str] = None
    image: Optional[str] = None

class ResearchAreaResponse(ResearchAreaCreate):
    id: int
    comments_count: int = 0
    status: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class ResearchAreaCommentCreate(BaseModel):
    message: str

class ResearchAreaCommentResponse(BaseModel):
    id: int
    research_area_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    comments_count: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- PUBLICATION ----------
class PublicationCreate(BaseModel):
    title: str
    authors: Optional[str] = None
    journal: Optional[str] = None
    year: Optional[str] = None
    image: Optional[str] = None

class PublicationResponse(PublicationCreate):
    id: int
    citation: int
    comments_count: int = 0
    status: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class PublicationCommentCreate(BaseModel):
    message: str

class PublicationCommentResponse(BaseModel):
    id: int
    publication_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    comments_count: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- RESEARCH LAB ----------
class ResearchLabCreate(BaseModel):
    name: str
    director: Optional[str] = None
    focus: Optional[str] = None
    image: Optional[str] = None

class ResearchLabResponse(ResearchLabCreate):
    id: int
    comments_count: int = 0
    status: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class ResearchLabCommentCreate(BaseModel):
    message: str

class ResearchLabCommentResponse(BaseModel):
    id: int
    research_lab_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    comments_count: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- TECH PARK ----------
class TechParkCreate(ContentBase):
    category: Optional[str] = None
    stat: Optional[str] = None

class TechParkResponse(ContentBase):
    id: int
    likes: int
    comments_count: int = 0
    category: Optional[str] = None
    stat: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class TechParkCommentCreate(BaseModel):
    message: str

class TechParkCommentResponse(BaseModel):
    id: int
    tech_park_id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    message: str
    comments_count: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- ADMIN ----------
class ContentTypeStats(BaseModel):
    type: str
    label: str
    total: int
    approved: int
    pending: int
    rejected: int

class UserRoleStats(BaseModel):
    role: str
    label: str
    count: int

class RecentActivityItem(BaseModel):
    action: str
    title: str
    content_type: str
    timestamp: str

class SystemInfo(BaseModel):
    api_status: str
    database_connected: bool
    version: str
    last_updated: str

class AdminStats(BaseModel):
    total_users: int
    total_news: int
    total_events: int
    total_innovations: int
    total_startups: int
    total_alumni: int
    total_donations: int
    pending_content: int
    active_users: int = 0
    approved_content: int = 0
    rejected_content: int = 0
    total_publications: int = 0
    total_likes: int = 0
    total_comments: int = 0
    content_by_type: List["ContentTypeStats"] = []
    users_by_role: List["UserRoleStats"] = []
    approval_pipeline: dict = {}
    recent_activity: List["RecentActivityItem"] = []
    system: Optional["SystemInfo"] = None
    period: str = "all"

class ContentStatusUpdate(BaseModel):
    status: str  # approved | rejected

class AdminContentUpdate(BaseModel):
    title: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    video: Optional[str] = None
    status: Optional[str] = None
    date: Optional[str] = None
    location: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    year: Optional[str] = None
    role: Optional[str] = None
    achievement: Optional[str] = None
    amount: Optional[float] = None
    message: Optional[str] = None
    category: Optional[str] = None
    stat: Optional[str] = None
    author_name: Optional[str] = None
    founder_name: Optional[str] = None
    authors: Optional[str] = None
    journal: Optional[str] = None
    director: Optional[str] = None
    focus: Optional[str] = None
    likes: Optional[int] = None
    comments_count: Optional[int] = None
    label: Optional[str] = None
    value: Optional[str] = None
    icon: Optional[str] = None
    featured: Optional[bool] = None
    goal_amount: Optional[str] = None
    raised_amount: Optional[str] = None
    sort_order: Optional[int] = None

# ---------- HERO VIDEOS ----------
class HeroVideoResponse(BaseModel):
    id: int
    page_key: str
    video_url: str
    original_filename: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# ---------- MESSAGES ----------
class MessageUserBrief(BaseModel):
    id: int
    name: str
    email: str
    role: str
    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    recipient_id: int
    body: str

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    body: str
    read_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    sender_name: Optional[str] = None
    recipient_name: Optional[str] = None
    class Config:
        from_attributes = True

class ConversationResponse(BaseModel):
    user: MessageUserBrief
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    last_sender_id: Optional[int] = None
    unread_count: int = 0

class UnreadCountResponse(BaseModel):
    count: int

# ---------- NOTIFICATIONS ----------
class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    read_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    unread_count: int

# ---------- SAVED CONTENT ----------
class SaveCreate(BaseModel):
    content_type: str
    content_id: int

class SaveToggleResponse(BaseModel):
    saved: bool
    content_type: str
    content_id: int
    count: int

class SavedIdResponse(BaseModel):
    content_type: str
    content_id: int

class SavedItemResponse(BaseModel):
    content_type: str
    content_id: int
    saved_at: Optional[datetime] = None
    item: dict

# ---------- USER FOLLOWS (legacy user-to-user; profile modal uses item follows) ----------
class FollowToggleResponse(BaseModel):
    following: bool
    user_id: int
    followers_count: int

# ---------- FOLLOWED ITEMS (content/story tracking) ----------
class FollowItemToggleResponse(BaseModel):
    following: bool
    content_type: str
    content_id: int
    count: int

class FollowedItemResponse(BaseModel):
    content_type: str
    content_id: int
    followed_at: Optional[datetime] = None
    item: dict

# ---------- PLATFORM SETTINGS ----------
class PlatformSettingsResponse(BaseModel):
    university_name: str
    motto: Optional[str] = ""
    tagline: Optional[str] = ""
    logo_url: Optional[str] = ""
    founded_year: Optional[int] = None
    contact_email: str
    contact_phone: Optional[str] = ""
    contact_address: Optional[str] = ""
    website_url: Optional[str] = ""
    facebook_url: Optional[str] = ""
    twitter_url: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    primary_color: str
    accent_color: str
    timezone: Optional[str] = "Africa/Kampala"
    maintenance_mode: bool = False
    allow_registrations: bool = True
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class PlatformSettingsPublicResponse(BaseModel):
    """Safe subset of platform settings for the public site."""
    university_name: str
    motto: Optional[str] = ""
    tagline: Optional[str] = ""
    logo_url: Optional[str] = ""
    contact_email: str
    contact_phone: Optional[str] = ""
    contact_address: Optional[str] = ""
    website_url: Optional[str] = ""
    facebook_url: Optional[str] = ""
    twitter_url: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    primary_color: str
    accent_color: str
    maintenance_mode: bool = False
    allow_registrations: bool = True

    class Config:
        from_attributes = True

class PlatformSettingsUpdate(BaseModel):
    university_name: Optional[str] = None
    motto: Optional[str] = None
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    founded_year: Optional[int] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_address: Optional[str] = None
    website_url: Optional[str] = None
    facebook_url: Optional[str] = None
    twitter_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None
    timezone: Optional[str] = None
    maintenance_mode: Optional[bool] = None
    allow_registrations: Optional[bool] = None

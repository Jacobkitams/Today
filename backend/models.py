from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, DateTime, Float, UniqueConstraint
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True)
    hashed_password = Column(String(255))
    name = Column(String(100))
    role = Column(String(50), default="public_visitor")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class News(Base):
    __tablename__ = "news"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    description = Column(Text)
    image = Column(String(512))
    video = Column(String(512), nullable=True)
    likes = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    author_name = Column(String(100))
    type = Column(String(50), default="news")
    status = Column(String(20), default="approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class NewsComment(Base):
    __tablename__ = "news_comments"
    id = Column(Integer, primary_key=True, index=True)
    news_id = Column(Integer, ForeignKey("news.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    parent_id = Column(Integer, ForeignKey("news_comments.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    description = Column(Text)
    image = Column(String(512))
    video = Column(String(512), nullable=True)
    likes = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    date = Column(String(100))
    location = Column(String(255))
    attendees = Column(Integer, default=0)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class EventComment(Base):
    __tablename__ = "event_comments"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Innovation(Base):
    __tablename__ = "innovations"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    description = Column(Text)
    image = Column(String(512))
    video = Column(String(512), nullable=True)
    likes = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    author_name = Column(String(100))
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class InnovationComment(Base):
    __tablename__ = "innovation_comments"
    id = Column(Integer, primary_key=True, index=True)
    innovation_id = Column(Integer, ForeignKey("innovations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Startup(Base):
    __tablename__ = "startups"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    description = Column(Text)
    image = Column(String(512))
    video = Column(String(512), nullable=True)
    likes = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    founder_name = Column(String(100))
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class StartupComment(Base):
    __tablename__ = "startup_comments"
    id = Column(Integer, primary_key=True, index=True)
    startup_id = Column(Integer, ForeignKey("startups.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AlumniProfile(Base):
    __tablename__ = "alumni_profiles"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(100))
    last_name = Column(String(100))
    year = Column(String(4))
    role = Column(String(100))
    achievement = Column(String(255))
    image = Column(String(255))
    likes = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AlumniComment(Base):
    __tablename__ = "alumni_comments"
    id = Column(Integer, primary_key=True, index=True)
    alumni_id = Column(Integer, ForeignKey("alumni_profiles.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Donation(Base):
    __tablename__ = "donations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    amount = Column(Float)
    message = Column(Text)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class DonationTier(Base):
    __tablename__ = "donation_tiers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    amount = Column(String(50))
    description = Column(Text)
    icon = Column(String(50), default="gift")
    featured = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    status = Column(String(20), default="approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class EndowmentStat(Base):
    __tablename__ = "endowment_stats"
    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(100))
    value = Column(String(50))
    sort_order = Column(Integer, default=0)
    status = Column(String(20), default="approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class EndowmentCampaign(Base):
    __tablename__ = "endowment_campaigns"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255))
    description = Column(Text)
    goal_amount = Column(String(50))
    raised_amount = Column(String(50))
    image = Column(String(255))
    likes = Column(Integer, default=0)
    status = Column(String(20), default="approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class EndowmentInfo(Base):
    __tablename__ = "endowment_info"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255))
    description = Column(Text)
    image = Column(String(255))
    status = Column(String(20), default="approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class CommunityItem(Base):
    __tablename__ = "commission_items"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    description = Column(Text)
    image = Column(String(255))
    likes = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    type = Column(String(50), default="news")
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class CommunityComment(Base):
    __tablename__ = "commission_comments"
    id = Column(Integer, primary_key=True, index=True)
    community_id = Column("commission_id", Integer, ForeignKey("commission_items.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ResearchArea(Base):
    __tablename__ = "research_areas"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255))
    description = Column(Text)
    image = Column(String(255))
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    comments_count = Column(Integer, default=0)
    status = Column(String(20), default="approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ResearchAreaComment(Base):
    __tablename__ = "research_area_comments"
    id = Column(Integer, primary_key=True, index=True)
    research_area_id = Column(Integer, ForeignKey("research_areas.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Publication(Base):
    __tablename__ = "publications"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255))
    authors = Column(String(255))
    journal = Column(String(100))
    year = Column(String(4))
    citation = Column(Integer, default=0)
    image = Column(String(255))
    comments_count = Column(Integer, default=0)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class PublicationComment(Base):
    __tablename__ = "publication_comments"
    id = Column(Integer, primary_key=True, index=True)
    publication_id = Column(Integer, ForeignKey("publications.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ResearchLab(Base):
    __tablename__ = "research_labs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255))
    director = Column(String(100))
    focus = Column(String(255))
    image = Column(String(255))
    comments_count = Column(Integer, default=0)
    status = Column(String(20), default="approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ResearchLabComment(Base):
    __tablename__ = "research_lab_comments"
    id = Column(Integer, primary_key=True, index=True)
    research_lab_id = Column(Integer, ForeignKey("research_labs.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TechParkItem(Base):
    __tablename__ = "tech_park_items"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    description = Column(Text)
    image = Column(String(255))
    category = Column(String(100))
    stat = Column(String(100))
    likes = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    status = Column(String(20), default="approved")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TechParkComment(Base):
    __tablename__ = "tech_park_comments"
    id = Column(Integer, primary_key=True, index=True)
    tech_park_id = Column(Integer, ForeignKey("tech_park_items.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class HeroVideo(Base):
    __tablename__ = "hero_videos"
    id = Column(Integer, primary_key=True, index=True)
    page_key = Column(String(50), unique=True, index=True)
    video_url = Column(String(512))
    original_filename = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String(255), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SavedItem(Base):
    __tablename__ = "saved_items"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content_type = Column(String(50), nullable=False)
    content_id = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("user_id", "content_type", "content_id", name="uq_saved_user_content"),
    )

class UserFollow(Base):
    __tablename__ = "user_follows"
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_user_follow_pair"),
    )

class FollowedItem(Base):
    __tablename__ = "followed_items"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content_type = Column(String(50), nullable=False)
    content_id = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("user_id", "content_type", "content_id", name="uq_followed_user_content"),
    )

class PlatformSettings(Base):
    __tablename__ = "platform_settings"
    id = Column(Integer, primary_key=True, index=True)
    university_name = Column(String(255), nullable=False, default="International University of East Africa")
    motto = Column(String(255), default="Learning to Succeed")
    tagline = Column(String(255), default="")
    logo_url = Column(String(255), default="")
    founded_year = Column(Integer, nullable=True)
    contact_email = Column(String(100), default="info@iuea.ac.ug")
    contact_phone = Column(String(50), default="")
    contact_address = Column(Text, default="")
    website_url = Column(String(255), default="https://iuea.ac.ug")
    facebook_url = Column(String(255), default="")
    twitter_url = Column(String(255), default="")
    linkedin_url = Column(String(255), default="")
    primary_color = Column(String(7), default="#800000")
    accent_color = Column(String(7), default="#cba052")
    timezone = Column(String(50), default="Africa/Kampala")
    maintenance_mode = Column(Boolean, default=False)
    allow_registrations = Column(Boolean, default=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

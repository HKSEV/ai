from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column

from config.database import Base


ADMIN = "ADMIN"
USER = "USER"


def utcnow():
  return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
  __tablename__ = "users"
  id: Mapped[int] = mapped_column(primary_key=True)
  kakao_id: Mapped[str] = mapped_column(String(64), unique=True)
  email: Mapped[str | None] = mapped_column(String(320))
  address_setup_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
  nickname: Mapped[str] = mapped_column(String(40))
  nickname_key: Mapped[str] = mapped_column(String(40), unique=True)
  preferences: Mapped[list] = mapped_column(JSON, default=list)
  budget_min: Mapped[int | None] = mapped_column(Integer)
  budget_max: Mapped[int | None] = mapped_column(Integer)
  created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
  role: Mapped[str] = mapped_column(String(5), default=USER, server_default=USER)
  __table_args__ = (CheckConstraint("role IN ('ADMIN', 'USER')", name="ck_users_role"),)


class AdminAssignment(Base):
  __tablename__ = "admin_assignment"
  id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
  user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
  __table_args__ = (CheckConstraint("id = 1", name="ck_admin_assignment_id"),)


class AdminAction(Base):
  __tablename__ = "admin_actions"
  id: Mapped[int] = mapped_column(primary_key=True)
  actor_name: Mapped[str] = mapped_column(String(40))
  action: Mapped[str] = mapped_column(String(32))
  target_id: Mapped[str] = mapped_column(String(40))
  target_label: Mapped[str] = mapped_column(String(200))
  created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PromptRevision(Base):
  __tablename__ = "prompt_revisions"
  id: Mapped[int] = mapped_column(primary_key=True)
  name: Mapped[str] = mapped_column(String(24))
  version: Mapped[int] = mapped_column(Integer)
  content: Mapped[str] = mapped_column(Text)
  editor_name: Mapped[str | None] = mapped_column(String(40))
  restored_from: Mapped[int | None] = mapped_column(Integer)
  created_at: Mapped[datetime | None] = mapped_column(DateTime)
  __table_args__ = (UniqueConstraint("name", "version", name="uq_prompt_revisions_name_version"),)


class AuthSession(Base):
  __tablename__ = "auth_sessions"
  token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
  user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
  expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
  created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OAuthState(Base):
  __tablename__ = "oauth_states"
  state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
  expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class Address(Base):
  __tablename__ = "addresses"
  id: Mapped[int] = mapped_column(primary_key=True)
  user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
  label: Mapped[str] = mapped_column(String(30))
  address: Mapped[str] = mapped_column(String(300))
  latitude: Mapped[float | None] = mapped_column(Float)
  longitude: Mapped[float | None] = mapped_column(Float)
  is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class Restaurant(Base):
  __tablename__ = "restaurants"
  id: Mapped[int] = mapped_column(primary_key=True)
  external_id: Mapped[str | None] = mapped_column(String(100), unique=True)
  name: Mapped[str] = mapped_column(String(150))
  address: Mapped[str] = mapped_column(String(300))
  area: Mapped[str] = mapped_column(String(100), default="노원구")
  category: Mapped[str] = mapped_column(String(100))
  phone: Mapped[str | None] = mapped_column(String(40))
  latitude: Mapped[float | None] = mapped_column(Float)
  longitude: Mapped[float | None] = mapped_column(Float)
  tags: Mapped[list] = mapped_column(JSON, default=list)
  hours: Mapped[dict | None] = mapped_column(JSON)
  closed_dates: Mapped[list] = mapped_column(JSON, default=list)
  hours_source: Mapped[str | None] = mapped_column(String(100))
  hours_source_url: Mapped[str | None] = mapped_column(String(500))
  hours_checked_at: Mapped[datetime | None] = mapped_column(DateTime)
  source: Mapped[str] = mapped_column(String(100))
  source_url: Mapped[str | None] = mapped_column(String(500))
  checked_at: Mapped[datetime | None] = mapped_column(DateTime)
  is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
  admin_edited_at: Mapped[datetime | None] = mapped_column(DateTime)
  deleted_at: Mapped[datetime | None] = mapped_column(DateTime)


class Menu(Base):
  __tablename__ = "menus"
  id: Mapped[int] = mapped_column(primary_key=True)
  restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
  name: Mapped[str] = mapped_column(String(100))
  price: Mapped[int | None] = mapped_column(Integer)
  servings: Mapped[int] = mapped_column(Integer, default=1)
  available: Mapped[bool] = mapped_column(Boolean, default=True)
  source: Mapped[str] = mapped_column(String(100))
  source_url: Mapped[str | None] = mapped_column(String(500))
  checked_at: Mapped[datetime | None] = mapped_column(DateTime)


class Conversation(Base):
  __tablename__ = "conversations"
  id: Mapped[int] = mapped_column(primary_key=True)
  user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
  title: Mapped[str] = mapped_column(String(100), default="새로운 맛집 산책")
  conditions: Mapped[dict] = mapped_column(JSON, default=dict)
  created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
  updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Message(Base):
  __tablename__ = "messages"
  id: Mapped[int] = mapped_column(primary_key=True)
  conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
  role: Mapped[str] = mapped_column(String(20))
  content: Mapped[str] = mapped_column(Text)
  recommendations: Mapped[list] = mapped_column(JSON, default=list)
  created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SearchRecord(Base):
  __tablename__ = "search_records"
  id: Mapped[int] = mapped_column(primary_key=True)
  user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
  conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
  query: Mapped[str] = mapped_column(Text)
  conditions: Mapped[dict] = mapped_column(JSON)
  restaurant_ids: Mapped[list] = mapped_column(JSON, default=list)
  created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Upload(Base):
  __tablename__ = "uploads"
  id: Mapped[str] = mapped_column(String(36), primary_key=True)
  user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
  kind: Mapped[str] = mapped_column(String(20))
  filename: Mapped[str] = mapped_column(String(100))
  created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Visit(Base):
  __tablename__ = "visits"
  id: Mapped[int] = mapped_column(primary_key=True)
  user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
  restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"))
  visited_on: Mapped[date] = mapped_column(Date)
  note: Mapped[str] = mapped_column(Text, default="")
  receipt_id: Mapped[str | None] = mapped_column(ForeignKey("uploads.id", ondelete="SET NULL"))
  verification_status: Mapped[str] = mapped_column(String(30), default="not_verified")
  created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Post(Base):
  __tablename__ = "posts"
  id: Mapped[int] = mapped_column(primary_key=True)
  user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
  kind: Mapped[str] = mapped_column(String(20), index=True)
  title: Mapped[str] = mapped_column(String(100))
  content: Mapped[str] = mapped_column(Text)
  restaurant_id: Mapped[int | None] = mapped_column(ForeignKey("restaurants.id"))
  rating: Mapped[int | None] = mapped_column(Integer)
  visited_on: Mapped[date | None] = mapped_column(Date)
  visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id", ondelete="SET NULL"))
  photo_ids: Mapped[list] = mapped_column(JSON, default=list)
  created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
  updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
  __table_args__ = (Index("ix_posts_restaurant_kind", "restaurant_id", "kind"),)

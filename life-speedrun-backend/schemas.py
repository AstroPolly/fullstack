# schemas.py — финальная правильная версия (без дублей и с EventUpdate)

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime
import re

class UserCreate(BaseModel):
    email: str
    password: str = Field(..., min_length=6)

class UserOut(BaseModel):
    id: int
    email: str

    class Config:
        from_attributes = True

class VerifyCode(BaseModel):
    email: str
    code: str

class Token(BaseModel):
    access_token: str
    token_type: str

class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    startTime: str          # "09:00"
    endTime: str            # "10:00"
    date: str               # "2025-06-10"
    isRange: bool
    isRecurring: bool
    recurrenceDays: int
    reminder: bool
    reminderMinutes: int
    color: str
    description: Optional[str] = None
    tags: List[int] = []

    @field_validator('date')
    @classmethod
    def validate_date(cls, v):
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError('Date must be in YYYY-MM-DD format')
        return v

    @field_validator('startTime', 'endTime')
    @classmethod
    def validate_time(cls, v):
        if not re.match(r'^\d{2}:\d{2}$', v):
            raise ValueError('Time must be in HH:MM format')
        return v

class EventUpdate(BaseModel):
    actual_start_time: Optional[datetime] = None
    actual_end_time: Optional[datetime] = None
    completed: bool = False
    notes: Optional[str] = None

class EventOut(BaseModel):
    id: int
    title: str
    startTime: str
    endTime: str
    date: str
    isRange: bool
    isRecurring: bool
    recurrenceDays: int
    reminder: bool
    reminderMinutes: int
    color: str
    description: Optional[str] = None
    tags: List[int]
    completed: bool
    notes: Optional[str] = None
    duration_seconds: Optional[int] = None  # вычисляется на лету

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

# Схемы для файлов
class FileUploadResponse(BaseModel):
    id: int
    file_name: str
    file_size: int
    content_type: str
    download_url: str
    created_at: datetime

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

class FileInfo(BaseModel):
    id: int
    file_name: str
    file_size: int
    content_type: str
    created_at: datetime

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

# Схемы для пагинации и фильтрации
class EventFilter(BaseModel):
    search: Optional[str] = None
    completed: Optional[bool] = None
    color: Optional[str] = None
    tag_ids: Optional[List[int]] = None

class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=100)
    sort_by: str = Field(default="created_at")
    sort_order: str = Field(default="desc", pattern="^(asc|desc)$")

class PaginatedEvents(BaseModel):
    items: List[EventOut]
    total: int
    page: int
    page_size: int
    total_pages: int
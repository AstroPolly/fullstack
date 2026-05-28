# main.py
from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Text, Float, and_, or_
from models import User, ScheduleEvent, EventFile
from schemas import (
    UserCreate, UserOut, EventCreate, EventOut, EventUpdate, VerifyCode, Token,
    FileUploadResponse, FileInfo, PaginatedEvents, EventFilter
)
from auth import (
    get_password_hash,
    create_access_token,
    get_current_user,
    get_db,
    verify_password
)
from verification import generate_code, store_code, verify_code
from email_utils import send_verification_email
import json
import os
import hashlib
import hmac
from datetime import datetime, timedelta
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from sqlalchemy import create_engine
from models import Base 
app = FastAPI(title="LyfeStyler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Create React App
        "http://localhost:5173",  # Vite
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# S3 Configuration (using local storage for demo, but structured for S3)
S3_BUCKET = os.getenv("S3_BUCKET", "lyfestyler-files")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/gif", "application/pdf", "text/plain", "application/json"]
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

@app.on_event("startup")
def init_db():
    engine = create_engine("sqlite:///./app.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)  # создаст таблицы по моделям
# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)


def generate_presigned_url(file_key: str, expiration: int = 3600) -> str:
    """Generate a pre-signed URL for file access (simulated for local storage)"""
    # In production with real S3, use boto3:
    # s3_client.generate_presigned_url('get_object', Params={'Bucket': S3_BUCKET, 'Key': file_key}, ExpiresIn=expiration)
    
    # For local demo, return a direct path with token
    expires = int(datetime.now().timestamp()) + expiration
    signature = hmac.new(
        S3_SECRET_KEY.encode() if S3_SECRET_KEY else b"secret",
        f"{file_key}:{expires}".encode(),
        hashlib.sha256
    ).hexdigest()
    return f"http://localhost:8000/files/{file_key}?expires={expires}&signature={signature}"


def validate_file(file: UploadFile) -> None:
    """Validate file type and size"""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file.content_type} not allowed. Allowed types: {', '.join(ALLOWED_CONTENT_TYPES)}"
        )


# --- Registration & Verification ---
@app.post("/register", status_code=201)
def register(user: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pw = get_password_hash(user.password)
    new_user = User(email=user.email, hashed_password=hashed_pw, is_verified=False)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Генерация и отправка кода
    code = generate_code()
    store_code(user.email, code)
    background_tasks.add_task(send_verification_email, user.email, code)

    return {"msg": "Verification code sent to your email"}

@app.post("/verify")
def verify_email(data: VerifyCode, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email already verified")

    if verify_code(data.email, data.code):
        user.is_verified = True
        db.commit()
        return {"msg": "Email verified successfully"}
    else:
        raise HTTPException(status_code=400, detail="Invalid or expired code")


# --- Auth (login) ---
@app.post("/token")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified")

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


# --- User Profile ---
@app.get("/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


# --- Events with Filtering, Search, Sorting, Pagination ---
@app.get("/events", response_model=PaginatedEvents)
def get_events(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(default=None, description="Search by title or description"),
    completed: Optional[bool] = Query(default=None, description="Filter by completion status"),
    color: Optional[str] = Query(default=None, description="Filter by color"),
    date_from: Optional[str] = Query(default=None, description="Filter events from date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(default=None, description="Filter events to date (YYYY-MM-DD)"),
    sort_by: str = Query(default="created_at", description="Sort field"),
    sort_order: str = Query(default="desc", regex="^(asc|desc)$", description="Sort order"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Base query - only user's events
    query = db.query(ScheduleEvent).filter(ScheduleEvent.user_id == current_user.id)
    
    # Apply filters
    if search:
        search_filter = or_(
            ScheduleEvent.title.ilike(f"%{search}%"),
            ScheduleEvent.description.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)
    
    if completed is not None:
        query = query.filter(ScheduleEvent.completed == completed)
    
    if color:
        query = query.filter(ScheduleEvent.color == color)
    
    if date_from:
        query = query.filter(ScheduleEvent.date >= date_from)
    
    if date_to:
        query = query.filter(ScheduleEvent.date <= date_to)
    
    # Get total count before pagination
    total = query.count()
    
    # Apply sorting
    valid_sort_fields = {
        "created_at": ScheduleEvent.created_at,
        "date": ScheduleEvent.date,
        "title": ScheduleEvent.title,
        "completed": ScheduleEvent.completed,
    }
    
    sort_field = valid_sort_fields.get(sort_by, ScheduleEvent.created_at)
    if sort_order == "desc":
        sort_field = sort_field.desc()
    
    query = query.order_by(sort_field)
    
    # Apply pagination
    offset = (page - 1) * page_size
    events = query.offset(offset).limit(page_size).all()
    
    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size
    
    # Convert events to response format
    result = []
    for ev in events:
        duration = None
        if ev.actual_start_time and ev.actual_end_time:
            delta = ev.actual_end_time - ev.actual_start_time
            duration = int(delta.total_seconds())
        
        tags_list = json.loads(ev.tags) if ev.tags else []
        
        result.append({
            "id": ev.id,
            "title": ev.title,
            "startTime": ev.start_time,
            "endTime": ev.end_time,
            "date": ev.date,
            "isRange": ev.is_range,
            "isRecurring": ev.is_recurring,
            "recurrenceDays": ev.recurrence_days,
            "reminder": ev.reminder,
            "reminderMinutes": ev.reminder_minutes,
            "color": ev.color,
            "description": ev.description,
            "tags": tags_list,
            "completed": ev.completed,
            "notes": ev.notes,
            "duration_seconds": duration
        })
    
    return {
        "items": result,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@app.post("/events", response_model=EventOut)
def create_event(
    event: EventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_event = ScheduleEvent(
        user_id=current_user.id,
        title=event.title,
        start_time=event.startTime,
        end_time=event.endTime,
        date=event.date,
        is_range=event.isRange,
        is_recurring=event.isRecurring,
        recurrence_days=event.recurrenceDays,
        reminder=event.reminder,
        reminder_minutes=event.reminderMinutes,
        color=event.color,
        description=event.description,
        tags=json.dumps(event.tags)
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


@app.put("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: int,
    update_data: EventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    event = db.query(ScheduleEvent).filter(
        ScheduleEvent.id == event_id,
        ScheduleEvent.user_id == current_user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Обновляем только переданные поля
    if update_data.actual_start_time is not None:
        event.actual_start_time = update_data.actual_start_time
    if update_data.actual_end_time is not None:
        event.actual_end_time = update_data.actual_end_time
    event.completed = update_data.completed
    if update_data.notes is not None:
        event.notes = update_data.notes

    db.commit()
    db.refresh(event)

    # Вычисляем duration для ответа
    duration = None
    if event.actual_start_time and event.actual_end_time:
        delta = event.actual_end_time - event.actual_start_time
        duration = int(delta.total_seconds())

    # Десериализуем tags
    tags_list = json.loads(event.tags) if event.tags else []

    return {
        "id": event.id,
        "title": event.title,
        "startTime": event.start_time,
        "endTime": event.end_time,
        "date": event.date,
        "isRange": event.is_range,
        "isRecurring": event.is_recurring,
        "recurrenceDays": event.recurrence_days,
        "reminder": event.reminder,
        "reminderMinutes": event.reminder_minutes,
        "color": event.color,
        "description": event.description,
        "tags": tags_list,
        "completed": event.completed,
        "notes": event.notes,
        "duration_seconds": duration
    }


@app.delete("/events/{event_id}")
def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    event = db.query(ScheduleEvent).filter(
        ScheduleEvent.id == event_id,
        ScheduleEvent.user_id == current_user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Delete associated files first
    db.query(EventFile).filter(EventFile.event_id == event_id).delete()
    
    # Delete the event
    db.delete(event)
    db.commit()
    
    return {"msg": "Event deleted successfully"}


# --- File Management ---
@app.post("/events/{event_id}/files", response_model=FileUploadResponse)
async def upload_file(
    event_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify event exists and belongs to user
    event = db.query(ScheduleEvent).filter(
        ScheduleEvent.id == event_id,
        ScheduleEvent.user_id == current_user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Validate file
    validate_file(file)
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE // (1024*1024)} MB"
        )
    
    # Generate unique file key
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in "._-")
    file_key = f"user_{current_user.id}/event_{event_id}/{timestamp}_{safe_filename}"
    
    # Save file locally (in production, upload to S3)
    file_path = os.path.join(UPLOAD_DIR, file_key.replace("/", "_"))
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Create database record
    db_file = EventFile(
        event_id=event_id,
        user_id=current_user.id,
        file_name=file.filename,
        file_size=file_size,
        content_type=file.content_type,
        s3_key=file_key
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    
    # Generate download URL
    download_url = generate_presigned_url(file_key)
    
    return {
        "id": db_file.id,
        "file_name": db_file.file_name,
        "file_size": db_file.file_size,
        "content_type": db_file.content_type,
        "download_url": download_url,
        "created_at": db_file.created_at
    }


@app.get("/events/{event_id}/files", response_model=List[FileInfo])
def get_event_files(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify event exists and belongs to user
    event = db.query(ScheduleEvent).filter(
        ScheduleEvent.id == event_id,
        ScheduleEvent.user_id == current_user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get all files for this event
    files = db.query(EventFile).filter(EventFile.event_id == event_id).all()
    
    return files


@app.get("/files/{file_key:path}")
async def download_file(
    file_key: str,
    expires: int = Query(...),
    signature: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify signature (in production, also check expiration)
    expected_signature = hmac.new(
        S3_SECRET_KEY.encode() if S3_SECRET_KEY else b"secret",
        f"{file_key}:{expires}".encode(),
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=403, detail="Invalid signature")
    
    # Check if file exists and user has access
    db_file = db.query(EventFile).filter(
        EventFile.s3_key == file_key,
        EventFile.user_id == current_user.id
    ).first()
    
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found or access denied")
    
    # Read file from local storage (in production, stream from S3)
    file_path = os.path.join(UPLOAD_DIR, file_key.replace("/", "_"))
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    with open(file_path, "rb") as f:
        content = f.read()
    
    from fastapi.responses import Response
    return Response(
        content=content,
        media_type=db_file.content_type,
        headers={"Content-Disposition": f'attachment; filename="{db_file.file_name}"'}
    )


@app.delete("/events/{event_id}/files/{file_id}")
def delete_file(
    event_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify event exists and belongs to user
    event = db.query(ScheduleEvent).filter(
        ScheduleEvent.id == event_id,
        ScheduleEvent.user_id == current_user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get file
    db_file = db.query(EventFile).filter(
        EventFile.id == file_id,
        EventFile.event_id == event_id,
        EventFile.user_id == current_user.id
    ).first()
    
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Delete file from disk
    file_path = os.path.join(UPLOAD_DIR, db_file.s3_key.replace("/", "_"))
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # Delete database record
    db.delete(db_file)
    db.commit()
    
    return {"msg": "File deleted successfully"}
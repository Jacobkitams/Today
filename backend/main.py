import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.formparsers import MultiPartParser
from database import engine, Base
from routes import auth_routes, content_routes, admin_routes, upload_routes, settings_routes, messages_routes, notifications_routes
from routes.upload_routes import MAX_UPLOAD_BYTES

# Starlette defaults to 1 MB per multipart part; FastAPI calls request.form() with that default.
# Raise it so image (20 MB) and video (200 MB) uploads are accepted before route handlers run.
MultiPartParser.spool_max_size = MAX_UPLOAD_BYTES
_orig_request_form = Request.form

def _request_form_with_upload_limit(
    self,
    *,
    max_files: int | float = 1000,
    max_fields: int | float = 1000,
    max_part_size: int = MAX_UPLOAD_BYTES,
):
    return _orig_request_form(
        self, max_files=max_files, max_fields=max_fields, max_part_size=max_part_size
    )

Request.form = _request_form_with_upload_limit

# Auto-create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="IUEA Today API", description="Backend for IUEA Today portal", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded media files
FRONTEND_ASSETS = os.path.join(os.path.dirname(__file__), "..", "frontend", "assets")
app.mount("/assets", StaticFiles(directory=os.path.abspath(FRONTEND_ASSETS)), name="assets")

app.include_router(auth_routes.router, prefix="/auth", tags=["Authentication"])
app.include_router(content_routes.router, prefix="/content", tags=["Content"])
app.include_router(admin_routes.router, prefix="/admin", tags=["Admin"])
app.include_router(messages_routes.router, prefix="/admin", tags=["Messages"])
app.include_router(notifications_routes.router, tags=["Notifications"])
app.include_router(upload_routes.router, prefix="/upload", tags=["Uploads"])
app.include_router(settings_routes.router, prefix="/settings", tags=["Settings"])

# Serve uploaded video files
BACKEND_UPLOADS = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(os.path.join(BACKEND_UPLOADS, "videos"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=os.path.abspath(BACKEND_UPLOADS)), name="uploads")

@app.get("/")
def read_root():
    return {"message": "IUEA Today API v2.0", "docs": "/docs"}

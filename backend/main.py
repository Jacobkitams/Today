import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

# Load .env file before anything else so DATABASE_URL, SECRET_KEY, etc. are set
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.formparsers import MultiPartParser
from database import engine, Base
from routes import auth_routes, content_routes, admin_routes, upload_routes, settings_routes, messages_routes, notifications_routes, form_submissions_routes, innovation_admin_routes
from routes.upload_routes import MAX_UPLOAD_BYTES

# Starlette defaults to 1 MB per multipart part; FastAPI calls request.form() with that default.
# Raise it so image (20 MB) and video (200 MB) uploads are accepted before route handlers run.
MultiPartParser.max_file_size = MAX_UPLOAD_BYTES
MultiPartParser.max_part_size = MAX_UPLOAD_BYTES

# Removed monkey patch as it conflicts with newer python-multipart/starlette parsing
# _orig_request_form = Request.form
# def _request_form_with_upload_limit(...): ...
# Request.form = _request_form_with_upload_limit

# Auto-create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="IUEA Today API", description="Backend for IUEA Today portal", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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
app.include_router(form_submissions_routes.router, prefix="/forms", tags=["Form Submissions"])
app.include_router(innovation_admin_routes.router, prefix="/innovation-admin", tags=["Innovation Admin"])

from fastapi.responses import FileResponse

# Serve uploaded video files
BACKEND_UPLOADS = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(os.path.join(BACKEND_UPLOADS, "videos"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=os.path.abspath(BACKEND_UPLOADS)), name="uploads")

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/{filename:path}")
def serve_frontend_files(filename: str):
    file_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # If file not found, fall back to index.html (useful if you ever add HTML5 routing)
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

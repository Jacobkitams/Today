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
from starlette.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.formparsers import MultiPartParser
from database import engine, Base
from routes import auth_routes, content_routes, admin_routes, upload_routes, settings_routes, messages_routes, notifications_routes, form_submissions_routes, innovation_admin_routes, event_registration_routes
from routes.upload_routes import MAX_UPLOAD_BYTES

# Starlette defaults to 1 MB per multipart part; FastAPI calls request.form() with that default.
# Raise it so image (20 MB) and video (200 MB) uploads are accepted before route handlers run.
MultiPartParser.max_file_size = MAX_UPLOAD_BYTES
MultiPartParser.max_part_size = MAX_UPLOAD_BYTES

# Auto-create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="IUEA Today API", description="Backend for IUEA Today portal", version="2.0.0")

# ---------------------------------------------------------------------------
# Media Cache Middleware
# ---------------------------------------------------------------------------
# Images and videos served from /uploads/* and /assets/* are immutable content
# (a new file is uploaded under a new hashed name every time).  Tell the browser
# to cache them aggressively so subsequent page loads and mobile revisits are
# instant without any re-downloads.
# ---------------------------------------------------------------------------
_MEDIA_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg",
    ".mp4", ".webm", ".ogg", ".mov",
    ".woff", ".woff2", ".ttf", ".eot",
    ".js", ".css",
}

class MediaCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        path = request.url.path.lower()
        ext = os.path.splitext(path)[1]

        # --- HTML / navigation pages: always re-validate ---
        # index.html MUST never be stale-cached; the browser must check the
        # server on every visit so that bumped ?v= query strings on JS/CSS
        # are always picked up immediately (including on mobile).
        if ext in (".html", "") or path in ("/", ""):
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        # --- Service Worker: must never be cached by HTTP cache ---
        elif "service-worker" in path:
            response.headers["Cache-Control"] = "no-store"

        elif path.startswith(("/uploads/", "/assets/")):
            if ext in _MEDIA_EXTENSIONS:
                # 7-day cache for user-uploaded media (images & videos)
                if path.startswith("/uploads/"):
                    response.headers["Cache-Control"] = "public, max-age=604800, immutable"
                # JS/CSS are versioned via ?v= query string — safe to cache long-term
                elif ext in {".js", ".css"}:
                    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
                else:
                    response.headers["Cache-Control"] = "public, max-age=604800, immutable"
                # Allow mobile browsers & CDNs to cache too
                if "Vary" not in response.headers:
                    response.headers["Vary"] = "Accept-Encoding"

        return response

app.add_middleware(MediaCacheMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend assets
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
app.include_router(event_registration_routes.router, prefix="/events-reg", tags=["Event Registration"])

from fastapi.responses import FileResponse

# Serve uploaded media files (images, videos)
BACKEND_UPLOADS = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(os.path.join(BACKEND_UPLOADS, "videos"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=os.path.abspath(BACKEND_UPLOADS)), name="uploads")

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

@app.get("/")
def serve_index():
    resp = FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
    resp.headers["Cache-Control"] = "no-cache, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    return resp

@app.get("/{filename:path}")
def serve_frontend_files(filename: str):
    file_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.isfile(file_path):
        resp = FileResponse(file_path)
        # HTML and service worker must always be re-validated
        if filename.endswith(".html") or "service-worker" in filename:
            resp.headers["Cache-Control"] = "no-cache, must-revalidate"
            resp.headers["Pragma"] = "no-cache"
        return resp
    # Fall back to index.html for HTML5 routing
    resp = FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
    resp.headers["Cache-Control"] = "no-cache, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    return resp

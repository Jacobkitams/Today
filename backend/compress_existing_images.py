"""
One-off script: recompress every image already sitting in frontend/assets/images
(and backend/uploads, if present) — resize down to a sane max dimension and
re-encode at a leaner quality, using the SAME format/extension the file
already has. The extension is never changed, because filenames are already
referenced by exact URL (including extension) from database rows — renaming
would break every one of those links.

Safe to re-run: images already small enough / already compressed are left
alone (only overwritten if the recompressed version is smaller).

Usage:
    python3 compress_existing_images.py             # do it
    python3 compress_existing_images.py --dry-run   # just report savings, write nothing
"""
import io
import os
import sys

from PIL import Image, ImageOps

MAX_IMAGE_DIMENSION = 1920
JPEG_QUALITY = 82

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET_DIRS = [
    os.path.join(HERE, "..", "frontend", "assets", "images"),
    os.path.join(HERE, "uploads"),
]

# extension -> PIL format name
FORMAT_BY_EXT = {
    ".jpg": "JPEG", ".jpeg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP",
}


def compress_one(path: str, ext: str):
    """Returns (original_bytes, new_bytes) or None if skipped/not worth it."""
    try:
        with open(path, "rb") as f:
            original = f.read()
    except OSError as e:
        print(f"  SKIP (read error): {path} — {e}")
        return None

    fmt = FORMAT_BY_EXT[ext]
    try:
        img = Image.open(io.BytesIO(original))
        if getattr(img, "is_animated", False):
            return None  # never touch animated GIF/WebP — would strip the animation

        img = ImageOps.exif_transpose(img)
        img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.LANCZOS)

        buf = io.BytesIO()
        if fmt == "JPEG":
            img.convert("RGB").save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        elif fmt == "PNG":
            img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB").save(
                buf, format="PNG", optimize=True
            )
        elif fmt == "WEBP":
            img.save(buf, format="WEBP", quality=JPEG_QUALITY)
        else:
            return None

        new_bytes = buf.getvalue()
        if len(new_bytes) >= len(original):
            return None
        return original, new_bytes
    except Exception as e:
        print(f"  SKIP (not a readable image): {path} — {e}")
        return None


def main():
    dry_run = "--dry-run" in sys.argv
    total_old = 0
    total_new = 0
    n_changed = 0
    n_seen = 0

    for target_dir in TARGET_DIRS:
        target_dir = os.path.normpath(target_dir)
        if not os.path.isdir(target_dir):
            continue
        print(f"Scanning {target_dir} ...")
        for root, _dirs, files in os.walk(target_dir):
            for name in files:
                ext = os.path.splitext(name)[1].lower()
                if ext not in FORMAT_BY_EXT:
                    continue  # leave gifs and anything else untouched
                n_seen += 1
                path = os.path.join(root, name)
                result = compress_one(path, ext)
                if result is None:
                    continue
                original, new_bytes = result
                old_size, new_size = len(original), len(new_bytes)
                total_old += old_size
                total_new += new_size
                n_changed += 1
                pct = 100 * (1 - new_size / old_size)
                print(f"  {os.path.relpath(path, HERE)}: {old_size/1024:.0f} KB -> {new_size/1024:.0f} KB ({pct:.0f}% smaller)")

                if not dry_run:
                    with open(path, "wb") as f:
                        f.write(new_bytes)

    print()
    print(f"Scanned {n_seen} images, recompressed {n_changed}.")
    if total_old:
        print(f"Total: {total_old/1024/1024:.1f} MB -> {total_new/1024/1024:.1f} MB "
              f"({100*(1-total_new/total_old):.0f}% smaller)")
    if dry_run:
        print("(dry run — nothing was written)")


if __name__ == "__main__":
    main()

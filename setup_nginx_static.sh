#!/bin/bash

# Ensure we are root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

CONFIG_FILE="/etc/nginx/sites-available/today.iuea.ac.ug"

# Check if already modified to prevent duplicate blocks
if grep -q "location /assets/" "$CONFIG_FILE"; then
  echo "Nginx config already has static file rules."
  exit 0
fi

# Insert the new location blocks for /assets/ and /uploads/ right before "location / {"
sed -i '/location \/ {/i \
    # Serve static assets directly from disk for high speed \
    location /assets/ { \
        alias /home/jacob/Today/frontend/assets/; \
        expires max; \
        add_header Cache-Control "public, max-age=31536000, immutable"; \
    } \
\
    location /uploads/ { \
        alias /home/jacob/Today/backend/uploads/; \
        expires max; \
        add_header Cache-Control "public, max-age=31536000, immutable"; \
        # Support HTTP Range requests for video seeking \
        add_header Accept-Ranges bytes; \
    } \
' "$CONFIG_FILE"

# Test and reload
nginx -t && systemctl reload nginx
echo "Nginx is now serving static files and videos directly! Loading speeds should be much faster."

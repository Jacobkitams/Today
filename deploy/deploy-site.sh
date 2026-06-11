#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash deploy/deploy-site.sh
#
# Optional env vars:
#   SERVER_NAME (default: today.iuea.ac.ug)
#   SITE_PORT (default: 8081)
#   SITE_ROOT (default: /var/www/${SERVER_NAME})
#
# Expects these files in the current directory:
#   baseline-v1.6.html
#   iuea-connect.css
# Optional media files:
#   test_video.mp4
#   students.mp4

SERVER_NAME="${SERVER_NAME:-today.iuea.ac.ug}"
SITE_PORT="${SITE_PORT:-8081}"
SITE_ROOT="${SITE_ROOT:-/var/www/${SERVER_NAME}}"
NGINX_AVAILABLE="/etc/nginx/sites-available/${SERVER_NAME}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SERVER_NAME}.conf"

mkdir -p "$SITE_ROOT"
install -m 0644 baseline-v1.6.html "$SITE_ROOT/index.html"
install -m 0644 iuea-connect.css "$SITE_ROOT/iuea-connect.css"

# Copy optional media only if present.
for media in test_video.mp4 students.mp4; do
    if [[ -f "$media" ]]; then
        install -m 0644 "$media" "$SITE_ROOT/$media"
    fi
done

sed \
    -e "s|__SITE_PORT__|${SITE_PORT}|g" \
    -e "s|__SERVER_NAME__|${SERVER_NAME}|g" \
    -e "s|__SITE_ROOT__|${SITE_ROOT}|g" \
    deploy/nginx.today.iuea.ac.ug.conf > "$NGINX_AVAILABLE"
chmod 0644 "$NGINX_AVAILABLE"
ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"

# Disable default site if enabled.
if [[ -L /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl reload nginx

echo "Static site deployed:"
echo "  server_name: $SERVER_NAME"
echo "  listen_port: $SITE_PORT"
echo "  root: $SITE_ROOT"

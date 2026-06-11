#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash deploy/setup-server.sh
#
# This script installs Nginx, PostgreSQL, and Certbot on Ubuntu.

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx postgresql postgresql-contrib certbot python3-certbot-nginx

systemctl enable nginx
systemctl start nginx
systemctl enable postgresql
systemctl start postgresql

echo "Server base packages installed."

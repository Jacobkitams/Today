#!/bin/bash

# Ensure we are root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

echo "Updating package lists..."
apt-get update -y

echo "Installing Certbot and Nginx plugin..."
apt-get install -y certbot python3-certbot-nginx

echo "Generating SSL Certificate for today.iuea.ac.ug..."
# This will automatically configure the existing Nginx block for SSL
certbot --nginx -d today.iuea.ac.ug --non-interactive --agree-tos -m admin@today.iuea.ac.ug --redirect

echo "Testing and Reloading Nginx..."
nginx -t && systemctl reload nginx

echo "SSL Configuration Complete! Cloudflare should now be able to connect securely."

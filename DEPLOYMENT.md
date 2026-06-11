# IUEA Today Deployment Guide

This guide deploys the current static site to a dedicated server for:

- https://today.iuea.ac.ug

It also provisions PostgreSQL with the schema in `iuea-todayDB.sql`.

This setup supports running the subdomain on its own port (default: `8081`).

## 1) Prepare VPS

Use an Ubuntu 22.04/24.04 server with a public IP and SSH access.

Copy project files to server:

```bash
scp -r /root/today user@YOUR_SERVER_IP:/home/user/today
```

SSH in:

```bash
ssh user@YOUR_SERVER_IP
cd /home/user/today
```

Install server packages:

```bash
sudo bash deploy/setup-server.sh
```

## 2) Deploy Site (Dedicated port first)

```bash
export SERVER_NAME='today.iuea.ac.ug'
export SITE_PORT='8081'
sudo bash deploy/deploy-site.sh
```

Verify in browser with server IP and port first:

- http://YOUR_SERVER_IP:8081

If UFW is enabled, allow the port:

```bash
sudo ufw allow 8081/tcp
sudo ufw reload
```

## 3) Initialize PostgreSQL

```bash
export DB_PASS='replace_with_strong_password'
sudo bash deploy/setup-db.sh
```

Quick check:

```bash
sudo -u postgres psql -d iuea_today -c "\dt"
```

## 4) DNS LAST (as requested)

After site works on server IP and port, create DNS records:

- Type: `A`
- Host: `today`
- Value: `YOUR_SERVER_IP`
- TTL: `300` (or provider default)

Wait for propagation.

## 5) Enable HTTPS after DNS resolves

For HTTPS on standard 443, switch Nginx to port `80` first:

```bash
export SERVER_NAME='today.iuea.ac.ug'
export SITE_PORT='80'
sudo bash deploy/deploy-site.sh
```

Run Certbot only after `today.iuea.ac.ug` points to the server IP:

```bash
sudo certbot --nginx -d today.iuea.ac.ug --redirect -m admin@iuea.ac.ug --agree-tos --no-eff-email
```

Verify:

- https://today.iuea.ac.ug

If you intentionally keep a non-standard port, Certbot `--nginx` cannot complete the normal HTTP-01 flow on that custom port; use port 80 for certificate issuance.

## 6) Important content check

The HTML references local video files:

- `test_video.mp4`
- `students.mp4`

These files are not currently present in this workspace. If you do not upload them to `/var/www/today.iuea.ac.ug`, those video sections will be empty or fail to play.

## 7) Useful operations

Reload Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Check logs:

```bash
sudo tail -f /var/log/nginx/today.iuea.ac.ug.error.log
```

Backup DB:

```bash
sudo -u postgres pg_dump iuea_today > iuea_today_$(date +%F).sql
```

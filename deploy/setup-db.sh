#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash deploy/setup-db.sh
#
# Creates DB and user, then imports iuea-todayDB.sql.
# Optional env vars:
#   DB_NAME (default: iuea_today)
#   DB_USER (default: iuea_today_user)
#   DB_PASS (required if DB_USER is created)

DB_NAME="${DB_NAME:-iuea_today}"
DB_USER="${DB_USER:-iuea_today_user}"
DB_PASS="${DB_PASS:-}"

if [[ -z "$DB_PASS" ]]; then
    echo "Set DB_PASS before running, for example:"
    echo "  export DB_PASS='change_me_securely'"
    exit 1
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO
\$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
      CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
   END IF;
END
\$\$;
SQL

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || true
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -f iuea-todayDB.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

echo "Database ${DB_NAME} initialized from iuea-todayDB.sql"

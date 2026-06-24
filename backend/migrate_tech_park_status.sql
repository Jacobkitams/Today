-- Add missing status column to tech_park_items (model expects status for create/list filters).
-- Run: /opt/lampp/bin/mysql -u root iuea_today < migrate_tech_park_status.sql

USE iuea_today;

ALTER TABLE tech_park_items
    ADD COLUMN status VARCHAR(20) DEFAULT 'approved';

UPDATE tech_park_items SET status = 'approved' WHERE status IS NULL;

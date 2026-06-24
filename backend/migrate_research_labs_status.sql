-- Add missing columns to research_labs (model expects status + created_at).
-- Run: /opt/lampp/bin/mysql -u root iuea_today < migrate_research_labs_status.sql

USE iuea_today;

ALTER TABLE research_labs
    ADD COLUMN status VARCHAR(20) DEFAULT 'approved',
    ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;

UPDATE research_labs SET status = 'approved' WHERE status IS NULL;

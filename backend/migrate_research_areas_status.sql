-- Add missing columns to research_areas (model expects status + created_at).
-- Run: /opt/lampp/bin/mysql -u root iuea_today < migrate_research_areas_status.sql

USE iuea_today;

ALTER TABLE research_areas
    ADD COLUMN status VARCHAR(20) DEFAULT 'approved',
    ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;

UPDATE research_areas SET status = 'approved' WHERE status IS NULL;

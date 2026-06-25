-- Optional data migration: update stored content_type values from commission -> community
-- Schema unchanged (tables remain commission_items / commission_comments).
-- Run: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_commission_to_community.sql

USE iuea_today;

UPDATE saved_items SET content_type = 'community' WHERE content_type = 'commission';
UPDATE followed_items SET content_type = 'community' WHERE content_type = 'commission';

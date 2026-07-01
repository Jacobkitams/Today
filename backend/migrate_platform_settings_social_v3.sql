-- Add Instagram and YouTube social URLs to platform settings
-- Run: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_platform_settings_social_v3.sql

SET @has_instagram := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'platform_settings'
      AND COLUMN_NAME = 'instagram_url'
);

SET @sql := IF(
    @has_instagram = 0,
    'ALTER TABLE platform_settings
        ADD COLUMN instagram_url VARCHAR(255) DEFAULT '''' AFTER linkedin_url,
        ADD COLUMN youtube_url VARCHAR(255) DEFAULT '''' AFTER instagram_url',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE platform_settings
SET
    instagram_url = 'https://www.instagram.com/iuea_uganda/',
    youtube_url = 'https://www.youtube.com/@iuea_uganda'
WHERE id = 1
  AND (instagram_url IS NULL OR instagram_url = '')
  AND (youtube_url IS NULL OR youtube_url = '');

-- Migrate platform_settings from legacy key/value to singleton row schema.
-- Run: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_platform_settings_v2.sql

-- Legacy key/value table from early prototype
SET @legacy_kv := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'platform_settings'
      AND COLUMN_NAME = 'key'
);

SET @sql := IF(
    @legacy_kv > 0,
    'RENAME TABLE platform_settings TO platform_settings_kv_legacy',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS platform_settings (
    id INT PRIMARY KEY,
    university_name VARCHAR(255) NOT NULL DEFAULT 'International University of East Africa',
    motto VARCHAR(255) DEFAULT 'Learning to Succeed',
    tagline VARCHAR(255) DEFAULT '',
    logo_url VARCHAR(255) DEFAULT '',
    founded_year INT NULL,
    contact_email VARCHAR(100) DEFAULT 'info@iuea.ac.ug',
    contact_phone VARCHAR(50) DEFAULT '',
    contact_address TEXT,
    website_url VARCHAR(255) DEFAULT 'https://iuea.ac.ug',
    facebook_url VARCHAR(255) DEFAULT '',
    twitter_url VARCHAR(255) DEFAULT '',
    linkedin_url VARCHAR(255) DEFAULT '',
    primary_color VARCHAR(7) DEFAULT '#800000',
    accent_color VARCHAR(7) DEFAULT '#cba052',
    timezone VARCHAR(50) DEFAULT 'Africa/Kampala',
    maintenance_mode TINYINT(1) DEFAULT 0,
    allow_registrations TINYINT(1) DEFAULT 1,
    updated_at DATETIME NULL
);

INSERT IGNORE INTO platform_settings (id) VALUES (1);

-- Add new columns when upgrading an existing column-based table
SET @has_tagline := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'platform_settings'
      AND COLUMN_NAME = 'tagline'
);

SET @sql := IF(
    @has_tagline = 0,
    'ALTER TABLE platform_settings
        ADD COLUMN tagline VARCHAR(255) DEFAULT '''' AFTER motto,
        ADD COLUMN logo_url VARCHAR(255) DEFAULT '''' AFTER tagline,
        ADD COLUMN founded_year INT NULL AFTER logo_url',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

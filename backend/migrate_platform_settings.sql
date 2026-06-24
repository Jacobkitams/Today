-- Platform settings singleton table (run once on existing databases)
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

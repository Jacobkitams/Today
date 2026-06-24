-- Run this against iuea_today in phpMyAdmin or mysql CLI.
-- SQLAlchemy create_all() will not ALTER existing tables.
-- If columns already exist, skip the ALTER TABLE block.

USE iuea_today;

ALTER TABLE alumni_profiles
    ADD COLUMN likes INT NOT NULL DEFAULT 0,
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS alumni_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alumni_id INT NOT NULL,
    user_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alumni_comments_alumni_id (alumni_id),
    CONSTRAINT fk_alumni_comments_alumni
        FOREIGN KEY (alumni_id) REFERENCES alumni_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_alumni_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

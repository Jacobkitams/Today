-- Run this against iuea_today in phpMyAdmin or mysql CLI.
-- SQLAlchemy create_all() will not ALTER existing tables.
-- If columns/tables already exist, skip the relevant statements.

USE iuea_today;

ALTER TABLE events
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS event_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_comments_event_id (event_id),
    CONSTRAINT fk_event_comments_event
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

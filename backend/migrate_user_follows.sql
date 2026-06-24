-- Run against iuea_today: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_user_follows.sql

USE iuea_today;

CREATE TABLE IF NOT EXISTS user_follows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    follower_id INT NOT NULL,
    following_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_follows_follower (follower_id),
    INDEX idx_user_follows_following (following_id),
    UNIQUE KEY uq_user_follow_pair (follower_id, following_id),
    CONSTRAINT fk_user_follows_follower
        FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_follows_following
        FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

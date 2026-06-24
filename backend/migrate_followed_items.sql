-- Run against iuea_today: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_followed_items.sql

USE iuea_today;

CREATE TABLE IF NOT EXISTS followed_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    content_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_followed_items_user_id (user_id),
    INDEX idx_followed_items_user_type (user_id, content_type),
    UNIQUE KEY uq_followed_user_content (user_id, content_type, content_id),
    CONSTRAINT fk_followed_items_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

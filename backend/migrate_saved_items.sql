-- Run against iuea_today: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_saved_items.sql

USE iuea_today;

CREATE TABLE IF NOT EXISTS saved_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    content_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_saved_items_user_id (user_id),
    INDEX idx_saved_items_user_type (user_id, content_type),
    UNIQUE KEY uq_saved_user_content (user_id, content_type, content_id),
    CONSTRAINT fk_saved_items_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

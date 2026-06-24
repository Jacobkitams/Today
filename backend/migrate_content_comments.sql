-- Run against iuea_today in phpMyAdmin or mysql CLI.
-- SQLAlchemy create_all() will not ALTER existing tables.
-- Skip statements if columns/tables already exist.

USE iuea_today;

ALTER TABLE news
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

UPDATE news n
SET comments_count = (
    SELECT COUNT(*) FROM news_comments nc WHERE nc.news_id = n.id
);

ALTER TABLE innovations
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

ALTER TABLE startups
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

ALTER TABLE commission_items
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

ALTER TABLE research_areas
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

ALTER TABLE publications
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

ALTER TABLE research_labs
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

ALTER TABLE tech_park_items
    ADD COLUMN comments_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS innovation_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    innovation_id INT NOT NULL,
    user_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_innovation_comments_innovation_id (innovation_id),
    CONSTRAINT fk_innovation_comments_innovation
        FOREIGN KEY (innovation_id) REFERENCES innovations(id) ON DELETE CASCADE,
    CONSTRAINT fk_innovation_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS startup_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    startup_id INT NOT NULL,
    user_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_startup_comments_startup_id (startup_id),
    CONSTRAINT fk_startup_comments_startup
        FOREIGN KEY (startup_id) REFERENCES startups(id) ON DELETE CASCADE,
    CONSTRAINT fk_startup_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS commission_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    commission_id INT NOT NULL,
    user_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_commission_comments_commission_id (commission_id),
    CONSTRAINT fk_commission_comments_commission
        FOREIGN KEY (commission_id) REFERENCES commission_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_commission_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS research_area_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    research_area_id INT NOT NULL,
    user_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_research_area_comments_area_id (research_area_id),
    CONSTRAINT fk_research_area_comments_area
        FOREIGN KEY (research_area_id) REFERENCES research_areas(id) ON DELETE CASCADE,
    CONSTRAINT fk_research_area_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS publication_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    publication_id INT NOT NULL,
    user_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_publication_comments_publication_id (publication_id),
    CONSTRAINT fk_publication_comments_publication
        FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE,
    CONSTRAINT fk_publication_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS research_lab_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    research_lab_id INT NOT NULL,
    user_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_research_lab_comments_lab_id (research_lab_id),
    CONSTRAINT fk_research_lab_comments_lab
        FOREIGN KEY (research_lab_id) REFERENCES research_labs(id) ON DELETE CASCADE,
    CONSTRAINT fk_research_lab_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tech_park_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tech_park_id INT NOT NULL,
    user_id INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tech_park_comments_item_id (tech_park_id),
    CONSTRAINT fk_tech_park_comments_item
        FOREIGN KEY (tech_park_id) REFERENCES tech_park_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_tech_park_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Run against iuea_today in phpMyAdmin or mysql CLI.
-- Adds threaded replies to news_comments via nullable parent_id.
-- Skip statements if the column/constraint already exist.

USE iuea_today;

ALTER TABLE news_comments
    ADD COLUMN parent_id INT NULL;

ALTER TABLE news_comments
    ADD CONSTRAINT fk_news_comments_parent
        FOREIGN KEY (parent_id) REFERENCES news_comments(id) ON DELETE CASCADE;

CREATE INDEX idx_news_comments_parent_id ON news_comments(parent_id);

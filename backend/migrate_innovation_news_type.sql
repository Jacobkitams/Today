-- Reclassify misclassified Innovation News rows (single-record dual visibility).
--
-- Approach: one news row with type=innovation appears in both general News feeds
-- (when API uses all=true / types=news,innovation) and Innovation News
-- (/content/news?type=innovation). No schema change required.
--
-- Background: uploads via "Add Innovation News" were stored as type=news due to a
-- frontend create-modal bug (select lacked innovation-news option).
--
-- Run: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_innovation_news_type.sql

USE iuea_today;

-- Preview candidates (optional; comment out in production runs)
-- SELECT id, title, type, status FROM news
-- WHERE type = 'news'
--   AND (
--     id = 4
--     OR LOWER(title) LIKE '%innovation%'
--     OR LOWER(description) LIKE '%innovation%'
--   );

UPDATE news
SET type = 'innovation',
    updated_at = NOW()
WHERE type = 'news'
  AND (
    id = 4
    OR LOWER(title) LIKE '%innovation%'
    OR LOWER(description) LIKE '%innovation%'
  );

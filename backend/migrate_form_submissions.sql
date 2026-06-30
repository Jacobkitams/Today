-- Run against iuea_today: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_form_submissions.sql

USE iuea_today;

CREATE TABLE IF NOT EXISTS form_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_type VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(50) NULL,
    details TEXT NULL,
    amount DOUBLE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    notes TEXT NULL,
    reviewed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_form_submissions_form_type (form_type),
    INDEX idx_form_submissions_status (status),
    INDEX idx_form_submissions_created_at (created_at),
    CONSTRAINT fk_form_submissions_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

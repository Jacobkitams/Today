-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('innovator', 'alumni', 'donor', 'entrepreneur', 'researcher', 'sys_admin', 'content_editor', 'content_admin')),
    assigned_sections TEXT[],
    profile_pic TEXT,
    bio TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create content sections table
CREATE TABLE content_sections (
    id SERIAL PRIMARY KEY,
    section_name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create content items table
CREATE TABLE content_items (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    body TEXT,
    excerpt TEXT,
    author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    section_id INTEGER REFERENCES content_sections(id) ON DELETE CASCADE,
    featured_image TEXT,
    tags TEXT[],
    status VARCHAR(20) DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'flagged')),
    is_approved BOOLEAN DEFAULT false,
    view_count INT DEFAULT 0,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create post reviews table
CREATE TABLE post_reviews (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES content_items(id) ON DELETE CASCADE,
    reviewed_by INTEGER REFERENCES users(id),
    action_taken VARCHAR(50) CHECK (action_taken IN ('approve', 'hide', 'delete', 'flag')),
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user activity log
CREATE TABLE user_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(255),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default content sections
INSERT INTO content_sections (section_name, slug, description, display_order) VALUES
('Innovation', 'innovation', 'Student and faculty innovations, projects, and prototypes', 1),
('Research', 'research', 'Research papers, findings, and collaborations', 2),
('Endowment', 'endowment', 'Endowment funds, donations, and impact stories', 3),
('Startups', 'startups', 'Student and alumni startup ventures', 4),
('Alumni', 'alumni', 'Alumni news, events, and networking', 5),
('Events', 'events', 'Campus events, workshops, and seminars', 6),
('News', 'news', 'Campus news and announcements', 7),
('Faculty', 'faculty', 'Faculty achievements and publications', 8),
('Programs', 'programs', 'Academic programs and courses', 9);

-- Create indexes for performance
CREATE INDEX idx_content_section_id ON content_items(section_id);
CREATE INDEX idx_content_author_id ON content_items(author_id);
CREATE INDEX idx_content_status ON content_items(status);
CREATE INDEX idx_users_user_type ON users(user_type);
CREATE INDEX idx_users_email ON users(email);

-- Verify setup
SELECT * FROM content_sections;
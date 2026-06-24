-- Demo/sample data for IUEA Today Commission module
-- Run: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_commission_demo.sql

USE iuea_today;

-- Commission News (2 items)
INSERT INTO commission_items (title, description, image, likes, comments_count, type, author_id, status, created_at) VALUES
(
  'Commission Launches Annual Governance Review',
  'The IUEA Commission has opened its annual governance review cycle, inviting faculty, students, and alumni to submit feedback on institutional policies and academic standards.',
  NULL,
  12,
  0,
  'news',
  8,
  'approved',
  '2026-05-12 10:00:00'
),
(
  'New Ethics Guidelines for Research Partnerships',
  'Updated ethics guidelines now govern all external research partnerships, ensuring transparency, accountability, and alignment with IUEA''s mission.',
  NULL,
  8,
  0,
  'news',
  8,
  'approved',
  '2026-05-28 14:30:00'
);

-- Standing Committees (2 items)
INSERT INTO commission_items (title, description, image, likes, comments_count, type, author_id, status, created_at) VALUES
(
  'Academic Standards Committee',
  'Oversees curriculum quality, accreditation compliance, and periodic review of academic programs across all schools.',
  NULL,
  0,
  0,
  'committee',
  8,
  'approved',
  '2026-04-01 09:00:00'
),
(
  'Student Welfare & Conduct Committee',
  'Addresses student grievances, disciplinary matters, and campus welfare initiatives in partnership with student leadership.',
  NULL,
  0,
  0,
  'committee',
  8,
  'approved',
  '2026-04-01 09:15:00'
);

-- Initiatives (2 items)
INSERT INTO commission_items (title, description, image, likes, comments_count, type, author_id, status, created_at) VALUES
(
  'Open Governance Portal',
  'A digital portal giving the IUEA community access to commission meeting minutes, policy drafts, and public consultation windows.',
  NULL,
  5,
  0,
  'initiative',
  8,
  'approved',
  '2026-03-15 11:00:00'
),
(
  'Campus Integrity Awareness Campaign',
  'A semester-long campaign promoting academic honesty, ethical leadership, and responsible citizenship among students and staff.',
  NULL,
  3,
  0,
  'initiative',
  8,
  'approved',
  '2026-03-20 16:00:00'
);

-- Reports (2 items)
INSERT INTO commission_items (title, description, image, likes, comments_count, type, author_id, status, created_at) VALUES
(
  '2025 Annual Accountability Report',
  'Summary of commission activities, policy decisions, and stakeholder engagement outcomes for the 2025 academic year.',
  NULL,
  0,
  0,
  'report',
  8,
  'approved',
  '2026-01-31 08:00:00'
),
(
  'Q1 2026 Governance Metrics',
  'Quarterly dashboard covering grievance resolution times, policy review completion rates, and community participation levels.',
  NULL,
  0,
  0,
  'report',
  8,
  'approved',
  '2026-04-10 12:00:00'
);

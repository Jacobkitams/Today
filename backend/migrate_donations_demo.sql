-- Demo/sample data for IUEA Today Donations module
-- Run: /opt/lampp/bin/mysql -u root iuea_today < backend/migrate_donations_demo.sql

USE iuea_today;

-- Supporters (donations)
INSERT INTO donations (name, amount, message, created_at) VALUES
('Dr. Sarah Nakato', 500.00, 'Proud to support scholarships for engineering students from my home district.', '2025-11-14 09:30:00'),
('James Okello', 250.00, 'In memory of my parents, who believed education changes families.', '2026-01-08 14:15:00'),
('IUEA Alumni Class of 2018', 1000.00, 'Our class reunion gift — investing in the next generation of leaders.', '2026-03-02 11:00:00'),
('Grace Achieng', 150.00, 'Small gift, big hope for campus facilities.', '2026-04-18 16:45:00'),
('East Africa Tech Foundation', 5000.00, 'Partnership contribution toward the Innovation Endowment.', '2026-05-10 10:00:00');

-- Giving Tiers (donation_tiers)
INSERT INTO donation_tiers (name, amount, description, icon, featured, sort_order, status) VALUES
('Friend of IUEA', '$50', 'Supports student welfare programs and campus community initiatives.', 'heart', 0, 1, 'approved'),
('Patron', '$250', 'Funds partial scholarships and learning resources for deserving students.', 'award', 0, 2, 'approved'),
('Visionary Circle', '$1,000', 'Named recognition and direct support for faculty research and lab equipment.', 'star', 1, 3, 'approved'),
('Legacy Builder', '$5,000', 'Endowment-level giving that creates lasting impact across schools and programs.', 'crown', 1, 4, 'approved');

-- Impact Stats (endowment_stats)
INSERT INTO endowment_stats (label, value, sort_order, status) VALUES
('Total Endowment', '$2.4M', 1, 'approved'),
('Scholarships Funded', '127', 2, 'approved'),
('Donors This Year', '342', 3, 'approved'),
('Countries Represented', '18', 4, 'approved');

-- Campaigns (endowment_campaigns)
INSERT INTO endowment_campaigns (title, description, goal_amount, raised_amount, status) VALUES
(
  'STEM Lab Equipment Drive',
  'Upgrade physics, chemistry, and computer science labs with modern instruments so students can compete globally in research and innovation.',
  '$75,000',
  '$48,200',
  'approved'
),
(
  'Student Emergency Fund',
  'Provide rapid financial assistance to students facing unexpected hardship — medical bills, family crises, or sudden loss of support.',
  '$30,000',
  '$22,750',
  'approved'
),
(
  'Library Modernization',
  'Expand digital archives, quiet study spaces, and e-resource subscriptions for IUEA''s central library.',
  '$50,000',
  '$31,400',
  'approved'
);

-- Endowment Info (endowment_info)
INSERT INTO endowment_info (title, description, status) VALUES
(
  'What Is the IUEA Endowment?',
  'The IUEA Endowment Fund is a permanently invested pool of donations whose returns support scholarships, faculty development, campus infrastructure, and student success programs — year after year, regardless of economic cycles.',
  'approved'
),
(
  'How Your Gift Helps',
  'Every contribution — whether $50 or $5,000 — strengthens the university''s ability to admit talented students regardless of financial background, retain world-class faculty, and maintain facilities that meet international standards.',
  'approved'
),
(
  'Stewardship & Transparency',
  'The Endowment is governed by the University Council with annual audited reports. Donors receive updates on fund performance, allocation priorities, and measurable outcomes such as scholarships awarded and projects completed.',
  'approved'
);

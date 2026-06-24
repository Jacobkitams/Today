-- Add engagement column for endowment campaign cards
ALTER TABLE endowment_campaigns
    ADD COLUMN IF NOT EXISTS likes INT NOT NULL DEFAULT 0;

-- JWT Token Management
-- Revoked tokens table for logout and security

CREATE TABLE IF NOT EXISTS revoked_tokens (
    id SERIAL PRIMARY KEY,
    token_id UUID NOT NULL UNIQUE,
    user_id INTEGER,
    reason VARCHAR(100) DEFAULT 'manual_revoke',
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_revoked_tokens_token_id ON revoked_tokens(token_id);
CREATE INDEX idx_revoked_tokens_user_id ON revoked_tokens(user_id);
CREATE INDEX idx_revoked_tokens_revoked_at ON revoked_tokens(revoked_at);

-- Auto-cleanup old revoked tokens (older than 7 days) - optional periodic job
-- This can be run via cron or periodic cleanup task

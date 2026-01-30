-- Multi-tenant Support: Competition-based Isolation
-- Each competition has its own game session and contestants

-- Add competition_id to game_sessions
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_game_sessions_competition_id ON game_sessions(competition_id);

-- Add competition_id to contestants (already exists via foreign key)
-- contestants.competition_id already exists, just ensure index
CREATE INDEX IF NOT EXISTS idx_contestants_competition_id ON contestants(competition_id);

-- Add competition_id to answers for proper isolation
ALTER TABLE answers
ADD COLUMN IF NOT EXISTS competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_answers_competition_id ON answers(competition_id);

-- Update questions to be competition-specific (optional - can be shared or competition-specific)
-- For now, questions are shared across competitions
-- If you want competition-specific questions:
-- ALTER TABLE questions ADD COLUMN competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE;
-- For shared questions, keep as is

-- Add unique constraint for active game session per competition
-- Only one active game session per competition
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_session_per_competition
ON game_sessions(competition_id)
WHERE state != 'IDLE';

COMMENT ON INDEX idx_unique_active_session_per_competition IS 'Ensure only one active game session per competition';

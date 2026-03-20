-- Event Log / Audit Trail
-- Records all significant game and admin actions for replay and auditing

CREATE TABLE IF NOT EXISTS event_log (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    actor_type VARCHAR(20) NOT NULL,       -- 'admin', 'player', 'jury', 'system'
    actor_id INTEGER,                       -- admin_id, contestant_id, or NULL for system
    actor_name VARCHAR(100),
    competition_id INTEGER REFERENCES competitions(id) ON DELETE SET NULL,
    question_id INTEGER,
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_competition ON event_log(competition_id);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);
CREATE INDEX IF NOT EXISTS idx_event_log_actor ON event_log(actor_type, actor_id);

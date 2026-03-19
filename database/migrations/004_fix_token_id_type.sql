-- Fix token_id column type: UUID -> TEXT
-- Required because revokeAllUserTokens stores non-UUID marker strings like 'user_revoke_all_1_...'

ALTER TABLE revoked_tokens ALTER COLUMN token_id TYPE TEXT;

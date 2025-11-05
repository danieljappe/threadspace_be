-- Temporarily disable the ltree trigger to fix comment creation
-- This should be run to fix the immediate issue

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS update_comment_path_trigger ON comments;
DROP FUNCTION IF EXISTS update_comment_path();

-- The path field will remain NULL for now
-- We can re-enable this later with a proper fix

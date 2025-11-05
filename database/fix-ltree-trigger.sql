-- Fix the ltree trigger to handle UUIDs properly
-- The issue is that UUIDs contain hyphens which are not valid in ltree format

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS update_comment_path_trigger ON comments;
DROP FUNCTION IF EXISTS update_comment_path();

-- Create a new function that handles UUIDs properly
CREATE OR REPLACE FUNCTION update_comment_path()
RETURNS TRIGGER AS $$
DECLARE
    parent_path LTREE;
    comment_id_text TEXT;
BEGIN
    -- Convert UUID to a valid ltree format by replacing hyphens with dots
    -- and ensuring it starts with a valid ltree character
    comment_id_text := 'c' || replace(NEW.id::text, '-', '');
    
    IF NEW.parent_id IS NULL THEN
        NEW.path = comment_id_text::ltree;
        NEW.depth = 0;
    ELSE
        SELECT path, depth + 1 INTO parent_path, NEW.depth
        FROM comments
        WHERE id = NEW.parent_id;
        
        -- Ensure parent_path is not null
        IF parent_path IS NULL THEN
            parent_path := 'root'::ltree;
        END IF;
        
        NEW.path = parent_path || ('.' || comment_id_text)::ltree;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER update_comment_path_trigger
BEFORE INSERT ON comments
FOR EACH ROW EXECUTE FUNCTION update_comment_path();

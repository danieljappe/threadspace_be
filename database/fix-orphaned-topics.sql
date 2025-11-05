-- Fix orphaned PostTopic records
-- This script removes PostTopic records where the topic no longer exists

-- Delete orphaned PostTopic records
DELETE FROM post_topics 
WHERE topic_id NOT IN (SELECT id FROM topics);

-- Add a foreign key constraint to prevent future orphaned records
-- (This should already exist, but let's make sure)
ALTER TABLE post_topics 
ADD CONSTRAINT fk_post_topics_topic_id 
FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE;

-- Add a check to ensure we don't have null topics in the future
-- This will prevent the issue from happening again
ALTER TABLE post_topics 
ADD CONSTRAINT check_topic_not_null 
CHECK (topic_id IS NOT NULL);

-- Optional: Add a trigger to automatically clean up orphaned records
CREATE OR REPLACE FUNCTION cleanup_orphaned_post_topics()
RETURNS TRIGGER AS $$
BEGIN
    -- Clean up any orphaned PostTopic records when a topic is deleted
    DELETE FROM post_topics 
    WHERE topic_id = OLD.id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically clean up orphaned records
DROP TRIGGER IF EXISTS cleanup_orphaned_post_topics_trigger ON topics;
CREATE TRIGGER cleanup_orphaned_post_topics_trigger
    AFTER DELETE ON topics
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_orphaned_post_topics();

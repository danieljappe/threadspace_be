-- Migration to update votable_type from VARCHAR to enum
-- This script should be run to update the existing database

-- First, create the enum type if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'votable_type') THEN
        CREATE TYPE votable_type AS ENUM ('post', 'comment');
    END IF;
END $$;

-- Check if the column is already an enum type
DO $$
BEGIN
    -- If the column is already the correct type, skip the migration
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'votes' 
        AND column_name = 'votable_type' 
        AND data_type = 'USER-DEFINED'
        AND udt_name = 'votable_type'
    ) THEN
        RAISE NOTICE 'Column votable_type is already of type votable_type enum. Migration not needed.';
        RETURN;
    END IF;
    
    -- Drop dependent views first
    DROP VIEW IF EXISTS trending_posts CASCADE;
    
    -- Add a temporary column with the new enum type
    ALTER TABLE votes ADD COLUMN votable_type_new votable_type;
    
    -- Update the temporary column with converted values
    UPDATE votes SET votable_type_new = votable_type::votable_type;
    
    -- Drop the old column
    ALTER TABLE votes DROP COLUMN votable_type;
    
    -- Rename the new column to the original name
    ALTER TABLE votes RENAME COLUMN votable_type_new TO votable_type;
    
    -- Make the column NOT NULL
    ALTER TABLE votes ALTER COLUMN votable_type SET NOT NULL;
    
    -- Recreate the trending_posts view
    CREATE OR REPLACE VIEW trending_posts AS
    SELECT 
        p.*,
        u.username,
        u.avatar_url,
        COUNT(DISTINCT c.id) as comment_count,
        COALESCE(SUM(CASE WHEN v.vote_type = 'UPVOTE' THEN 1 WHEN v.vote_type = 'DOWNVOTE' THEN -1 ELSE 0 END), 0) as vote_score,
        (p.views * 0.3 + 
         COUNT(DISTINCT c.id) * 2 + 
         COALESCE(SUM(CASE WHEN v.vote_type = 'UPVOTE' THEN 1 WHEN v.vote_type = 'DOWNVOTE' THEN -1 ELSE 0 END), 0) * 1.5 +
         CASE WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 10 ELSE 0 END
        ) as trending_score
    FROM posts p
    LEFT JOIN users u ON p.author_id = u.id
    LEFT JOIN comments c ON p.id = c.post_id
    LEFT JOIN votes v ON p.id = v.votable_id AND v.votable_type = 'post'
    WHERE p.created_at > NOW() - INTERVAL '7 days'
      AND p.deleted_at IS NULL
    GROUP BY p.id, u.username, u.avatar_url
    ORDER BY trending_score DESC;
    
    RAISE NOTICE 'Successfully migrated votable_type column to enum type.';
END $$;

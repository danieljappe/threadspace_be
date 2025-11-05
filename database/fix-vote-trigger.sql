-- Fix the update_user_reputation trigger function
-- The issue is that it's trying to access NEW.author_id from votes table
-- but votes table doesn't have author_id - we need to get it from the post/comment

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS update_reputation_on_vote ON votes;
DROP FUNCTION IF EXISTS update_user_reputation();

-- Create a corrected function that gets author_id from the voted post/comment
CREATE OR REPLACE FUNCTION update_user_reputation()
RETURNS TRIGGER AS $$
BEGIN
    -- Update reputation based on the vote type
    IF NEW.votable_type = 'post' THEN
        UPDATE users 
        SET reputation = (
            SELECT COALESCE(SUM(
                CASE 
                    WHEN v.vote_type = 'UPVOTE' THEN 1
                    WHEN v.vote_type = 'DOWNVOTE' THEN -1
                    ELSE 0
                END
            ), 0)
            FROM votes v
            JOIN posts p ON v.votable_id = p.id
            WHERE p.author_id = (
                SELECT author_id FROM posts WHERE id = NEW.votable_id
            )
            AND v.votable_type = 'post'
        )
        WHERE id = (
            SELECT author_id FROM posts WHERE id = NEW.votable_id
        );
    ELSIF NEW.votable_type = 'comment' THEN
        UPDATE users 
        SET reputation = (
            SELECT COALESCE(SUM(
                CASE 
                    WHEN v.vote_type = 'UPVOTE' THEN 1
                    WHEN v.vote_type = 'DOWNVOTE' THEN -1
                    ELSE 0
                END
            ), 0)
            FROM votes v
            JOIN comments c ON v.votable_id = c.id
            WHERE c.author_id = (
                SELECT author_id FROM comments WHERE id = NEW.votable_id
            )
            AND v.votable_type = 'comment'
        )
        WHERE id = (
            SELECT author_id FROM comments WHERE id = NEW.votable_id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER update_reputation_on_vote
    AFTER INSERT OR UPDATE OR DELETE ON votes
    FOR EACH ROW EXECUTE FUNCTION update_user_reputation();

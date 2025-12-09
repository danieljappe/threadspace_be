-- Add indexes optimized for cursor-based pagination on posts
-- These indexes support efficient pagination queries

-- Composite index for the most common query pattern:
-- WHERE deleted_at IS NULL ORDER BY created_at DESC
-- Using NULLS FIRST to optimize for the common case where deleted_at IS NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_pagination_newest 
ON posts (created_at DESC, id DESC) 
WHERE deleted_at IS NULL;

-- Composite index for TOP ordering (by views)
-- WHERE deleted_at IS NULL ORDER BY views DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_pagination_top 
ON posts (views DESC, id DESC) 
WHERE deleted_at IS NULL;

-- Composite index for OLDEST ordering
-- WHERE deleted_at IS NULL ORDER BY created_at ASC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_pagination_oldest 
ON posts (created_at ASC, id ASC) 
WHERE deleted_at IS NULL;

-- Index for author filtering with pagination
-- WHERE deleted_at IS NULL AND author_id = ? ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_author_pagination 
ON posts (author_id, created_at DESC, id DESC) 
WHERE deleted_at IS NULL;

-- GIN index for text search optimization (if not already exists)
-- Supports ILIKE queries on title and content
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_title_trgm 
ON posts USING GIN (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_content_trgm 
ON posts USING GIN (content gin_trgm_ops);

-- Index for trending posts query (recent posts with high engagement)
-- WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '7 days'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_trending 
ON posts (created_at DESC, views DESC, id DESC) 
WHERE deleted_at IS NULL;

-- Index for votes lookup (used in batch queries for posts)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_votes_post_lookup 
ON votes (votable_id, votable_type) 
WHERE votable_type = 'post';

-- Index for bookmarks lookup (used in batch queries for posts)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_post_lookup 
ON bookmarks (post_id, user_id);

-- Analyze tables to update statistics for query planner
ANALYZE posts;
ANALYZE votes;
ANALYZE bookmarks;







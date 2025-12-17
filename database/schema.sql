-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- Create custom types
CREATE TYPE thread_type AS ENUM ('DISCUSSION', 'QUESTION', 'ANNOUNCEMENT', 'POLL');
CREATE TYPE vote_type AS ENUM ('UPVOTE', 'DOWNVOTE');
CREATE TYPE votable_type AS ENUM ('post', 'comment');
CREATE TYPE notification_type AS ENUM ('COMMENT', 'REPLY', 'FOLLOW', 'MENTION', 'VOTE');

-- Users table with enhanced security
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(30) UNIQUE NOT NULL CHECK (username ~ '^[a-zA-Z0-9_]+$'),
    email VARCHAR(255) UNIQUE NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    password_hash VARCHAR(255) NOT NULL,
    bio TEXT,
    avatar_url VARCHAR(500),
    reputation INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Posts table
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    content TEXT NOT NULL,
    thread_type thread_type DEFAULT 'DISCUSSION',
    views INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Comments with hierarchical structure
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    depth INTEGER DEFAULT 0,
    path LTREE,
    is_edited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Topics
CREATE TABLE topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(7) CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    subscriber_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relationship tables
CREATE TABLE post_topics (
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, topic_id)
);

CREATE TABLE user_topics (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE follows (
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id != following_id)
);

-- Voting system
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    votable_id UUID NOT NULL,
    votable_type votable_type NOT NULL,
    vote_type vote_type NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, votable_id, votable_type)
);

-- Bookmarks
CREATE TABLE bookmarks (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id)
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    data JSONB NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session management for security
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    refresh_token_hash VARCHAR(255) UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for security tracking
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES for performance
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_thread_type ON posts(thread_type);
CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_path ON comments USING GIST(path);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_votes_votable ON votes(votable_id, votable_type);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);

-- Full text search indexes
CREATE INDEX idx_posts_search ON posts USING GIN(to_tsvector('english', title || ' ' || content));
CREATE INDEX idx_comments_search ON comments USING GIN(to_tsvector('english', content));

-- STORED PROCEDURES
-- Update user reputation
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

-- Audit log function
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (
        current_setting('app.current_user_id', true)::uuid,
        TG_OP,
        TG_TABLE_NAME,
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.id
            ELSE NEW.id
        END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGERS
CREATE TRIGGER update_reputation_trigger
AFTER INSERT OR UPDATE OR DELETE ON votes
FOR EACH ROW EXECUTE FUNCTION update_user_reputation();

CREATE TRIGGER audit_users_trigger
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_posts_trigger
AFTER INSERT OR UPDATE OR DELETE ON posts
FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Create database users with proper privileges
CREATE USER threadspace_app WITH PASSWORD 'app_password';
CREATE USER threadspace_admin WITH PASSWORD 'admin_password';

-- Grant privileges
GRANT CONNECT ON DATABASE threadspace TO threadspace_app;
GRANT USAGE ON SCHEMA public TO threadspace_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO threadspace_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO threadspace_app;

-- Admin gets all privileges
GRANT ALL PRIVILEGES ON DATABASE threadspace TO threadspace_admin;
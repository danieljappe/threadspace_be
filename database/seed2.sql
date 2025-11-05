-- Seed test data
INSERT INTO users (username, email, password_hash, bio, is_verified) VALUES
('johndoe', 'john@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXQxq0M6Kj6e', 'Software developer passionate about web technologies', true);

-- Insert topics if they don't exist
INSERT INTO topics (name, slug, description, color) VALUES
('JavaScript', 'javascript', 'All things JavaScript', '#F7DF1E'),
('React', 'react', 'React.js discussions', '#61DAFB'),
('Node.js', 'nodejs', 'Server-side JavaScript', '#339933'),
('GraphQL', 'graphql', 'GraphQL API discussions', '#E10098'),
('Web Security', 'web-security', 'Security best practices', '#FF0000')
ON CONFLICT (slug) DO NOTHING;

-- Create 2 posts for the user
DO $$
DECLARE
    user_id UUID;
    post_id UUID;
    topic_count INTEGER;
BEGIN
    -- Get the user ID for johndoe
    SELECT id INTO user_id FROM users WHERE username = 'johndoe';
    
    -- Check if user exists
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'User johndoe not found';
    END IF;
    
    -- Get count of available topics
    SELECT COUNT(*) INTO topic_count FROM topics;
    
    -- Create first post
    INSERT INTO posts (author_id, title, content, thread_type)
    VALUES (
        user_id,
        'Getting Started with Web Development',
        'This is my first post about web development fundamentals and best practices. I want to share my journey learning modern web technologies and get feedback from the community.',
        'DISCUSSION'
    ) RETURNING id INTO post_id;
    
    -- Add topics to first post if topics exist
    IF topic_count > 0 THEN
        INSERT INTO post_topics (post_id, topic_id)
        SELECT post_id, id
        FROM topics
        ORDER BY random()
        LIMIT LEAST(2, topic_count);
    END IF;
    
    -- Create second post
    INSERT INTO posts (author_id, title, content, thread_type)
    VALUES (
        user_id,
        'Question about React State Management',
        'I have a question about the best practices for managing state in React applications. Should I use Redux, Context API, or Zustand for a medium-sized application?',
        'QUESTION'
    ) RETURNING id INTO post_id;
    
    -- Add topics to second post if topics exist
    IF topic_count > 0 THEN
        INSERT INTO post_topics (post_id, topic_id)
        SELECT post_id, id
        FROM topics
        ORDER BY random()
        LIMIT LEAST(2, topic_count);
    END IF;
END $$;
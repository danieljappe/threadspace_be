-- Seed test data
INSERT INTO users (username, email, password_hash, bio, is_verified) VALUES
('john_doe', 'john@example.com', '$argon2id$v=19$m=65536,t=3,p=4$...', 'Software developer passionate about web technologies', true),
('jane_smith', 'jane@example.com', '$argon2id$v=19$m=65536,t=3,p=4$...', 'Full-stack engineer and open source contributor', true),
('tech_guru', 'guru@example.com', '$argon2id$v=19$m=65536,t=3,p=4$...', 'Tech enthusiast and blogger', true);

INSERT INTO topics (name, slug, description, color) VALUES
('JavaScript', 'javascript', 'All things JavaScript', '#F7DF1E'),
('React', 'react', 'React.js discussions', '#61DAFB'),
('Node.js', 'nodejs', 'Server-side JavaScript', '#339933'),
('GraphQL', 'graphql', 'GraphQL API discussions', '#E10098'),
('Web Security', 'web-security', 'Security best practices', '#FF0000');

-- Generate more test data with procedures
DO $$
DECLARE
    i INTEGER;
    user_id UUID;
    post_id UUID;
BEGIN
    -- Generate 100 users
    FOR i IN 1..100 LOOP
        INSERT INTO users (username, email, password_hash, bio)
        VALUES (
            'user_' || i,
            'user' || i || '@example.com',
            '$argon2id$v=19$m=65536,t=3,p=4$...',
            'Test user ' || i
        ) RETURNING id INTO user_id;
        
        -- Each user creates 2-5 posts
        FOR j IN 1..(2 + random() * 3)::int LOOP
            INSERT INTO posts (author_id, title, content, thread_type)
            VALUES (
                user_id,
                'Discussion about topic ' || (random() * 100)::int,
                'This is a detailed discussion about various web development topics...',
                        (ARRAY['DISCUSSION', 'QUESTION', 'ANNOUNCEMENT']::thread_type[])[1 + random() * 2]
            ) RETURNING id INTO post_id;
            
            -- Add random topics to posts
            INSERT INTO post_topics (post_id, topic_id)
            SELECT post_id, id
            FROM topics
            ORDER BY random()
            LIMIT (1 + random() * 2)::int;
        END LOOP;
    END LOOP;
END $$;
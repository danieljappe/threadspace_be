-- ============================================================================
-- THREADSPACE LARGE DATASET SEEDER
-- Creates: 100 users, 50 posts, ~125 comments, randomized votes
-- ============================================================================

-- Clear existing data (be careful in production!)
TRUNCATE TABLE votes, bookmarks, notifications, post_topics, comments, posts, user_topics, follows, topics, sessions, audit_logs CASCADE;
DELETE FROM users WHERE username != 'admin'; -- Keep admin if exists

-- ============================================================================
-- TOPICS (15 diverse topics)
-- ============================================================================
INSERT INTO topics (name, slug, description, color) VALUES
('JavaScript', 'javascript', 'All things JavaScript - ES6+, frameworks, and beyond', '#F7DF1E'),
('TypeScript', 'typescript', 'TypeScript discussions, tips, and best practices', '#3178C6'),
('React', 'react', 'React.js components, hooks, and ecosystem', '#61DAFB'),
('Node.js', 'nodejs', 'Server-side JavaScript with Node.js', '#339933'),
('GraphQL', 'graphql', 'GraphQL APIs, schemas, and resolvers', '#E10098'),
('Web Security', 'web-security', 'Security best practices and vulnerability discussions', '#FF4136'),
('DevOps', 'devops', 'CI/CD, containers, and infrastructure', '#326CE5'),
('Python', 'python', 'Python programming and ecosystem', '#3776AB'),
('Rust', 'rust', 'Rust programming language discussions', '#DEA584'),
('Go', 'golang', 'Go language and backend development', '#00ADD8'),
('Machine Learning', 'machine-learning', 'ML, AI, and data science', '#FF6F00'),
('Career', 'career', 'Career advice and professional development', '#9B59B6'),
('Open Source', 'open-source', 'Open source projects and contributions', '#3EAF7C'),
('System Design', 'system-design', 'Architecture and system design patterns', '#E74C3C'),
('Mobile Dev', 'mobile-dev', 'iOS, Android, and cross-platform development', '#A4C639')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 100 USERS
-- ============================================================================
DO $$
DECLARE
    first_names TEXT[] := ARRAY[
        'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery', 
        'Parker', 'Skyler', 'Reese', 'Dakota', 'Charlie', 'Drew', 'Emery', 'Finley',
        'Hayden', 'Jamie', 'Kendall', 'Logan', 'Marley', 'Nico', 'Oakley', 'Peyton',
        'River', 'Sage', 'Tatum', 'Val', 'Winter', 'Zion', 'Blake', 'Cameron',
        'Devon', 'Ellis', 'Frankie', 'Gray', 'Harper', 'Indigo', 'Jules', 'Kit',
        'Lane', 'Milan', 'Noel', 'Ocean', 'Phoenix', 'Quinn', 'Remy', 'Shay',
        'Tristan', 'Uma', 'Vaughn', 'Wren', 'Xen', 'Yuri', 'Zephyr', 'Ash',
        'Bay', 'Cruz', 'Dallas', 'Eden', 'Flynn', 'Genesis', 'Halo', 'Ivory',
        'Jett', 'Kai', 'Lennox', 'Maddox', 'Navy', 'Orion', 'Pax', 'Quest',
        'Reign', 'Storm', 'True', 'Unity', 'Vesper', 'Wilder', 'Xander', 'York'
    ];
    
    last_parts TEXT[] := ARRAY[
        'dev', 'coder', 'hacker', 'ninja', 'wizard', 'guru', 'pro', 'master',
        'tech', 'bytes', 'bits', 'node', 'stack', 'cloud', 'data', 'cyber',
        'pixel', 'code', 'logic', 'algo', 'sys', 'net', 'web', 'app',
        'rust', 'go', 'js', 'py', 'ts', 'ml'
    ];
    
    bio_templates TEXT[] := ARRAY[
        'Full-stack developer with %s years of experience. Love building scalable applications.',
        'Backend engineer passionate about distributed systems and %s. Currently learning Rust.',
        'Frontend developer specializing in React and TypeScript. %s enthusiast.',
        'DevOps engineer automating everything. Kubernetes and %s are my tools.',
        'Software architect focused on clean code and %s patterns.',
        'Open source contributor and %s advocate. Building tools for developers.',
        'Tech lead at a startup. Passionate about %s and mentoring junior devs.',
        'Self-taught developer. From bootcamp to senior engineer in %s years.',
        'Security researcher and %s specialist. Finding bugs is my superpower.',
        'Machine learning engineer exploring %s. Python and PyTorch enthusiast.',
        'Mobile developer building cross-platform apps. %s and React Native.',
        'Database administrator turned developer. Love optimizing %s queries.',
        'Cloud architect designing systems at scale. AWS and %s certified.',
        'Indie hacker building SaaS products. %s is my current stack.',
        'Technical writer and developer advocate. Making %s accessible to everyone.'
    ];
    
    specialties TEXT[] := ARRAY[
        'microservices', 'GraphQL', 'WebSockets', 'serverless', 'performance',
        'accessibility', 'testing', 'CI/CD', 'Docker', 'PostgreSQL',
        'MongoDB', 'Redis', 'Elasticsearch', 'Next.js', 'Vue.js'
    ];
    
    i INTEGER;
    username_base TEXT;
    username_suffix TEXT;
    full_username TEXT;
    email TEXT;
    bio TEXT;
    years TEXT;
BEGIN
    FOR i IN 1..100 LOOP
        -- Generate unique username
        username_base := first_names[1 + (random() * (array_length(first_names, 1) - 1))::int];
        username_suffix := last_parts[1 + (random() * (array_length(last_parts, 1) - 1))::int];
        full_username := lower(username_base || '_' || username_suffix || '_' || i);
        
        email := full_username || '@example.com';
        
        -- Generate bio
        years := (2 + (random() * 13)::int)::text;
        bio := format(
            bio_templates[1 + (random() * (array_length(bio_templates, 1) - 1))::int],
            CASE WHEN random() > 0.5 THEN years ELSE specialties[1 + (random() * (array_length(specialties, 1) - 1))::int] END
        );
        
        INSERT INTO users (username, email, password_hash, bio, is_verified, is_admin, reputation, created_at)
        VALUES (
            full_username,
            email,
            '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXQxq0M6Kj6e', -- password: "password123"
            bio,
            random() > 0.3, -- 70% verified
            i <= 3, -- First 3 users are admins
            (random() * 500)::int,
            NOW() - (random() * 365 || ' days')::interval
        );
    END LOOP;
END $$;

-- ============================================================================
-- 50 POSTS with realistic content
-- ============================================================================
DO $$
DECLARE
    post_titles TEXT[] := ARRAY[
        'How I built a real-time collaboration tool with WebSockets',
        'The ultimate guide to TypeScript generics',
        'Why I switched from Redux to Zustand',
        'Building a GraphQL API from scratch - lessons learned',
        'My journey from junior to senior developer in 3 years',
        'Understanding React Server Components',
        'Docker best practices for production deployments',
        'How to structure a large-scale Node.js application',
        'Performance optimization techniques for React apps',
        'Introduction to Rust for JavaScript developers',
        'Building type-safe APIs with tRPC',
        'The case for monorepos in 2024',
        'Implementing authentication with JWTs - security considerations',
        'How to write tests that actually matter',
        'Database indexing strategies for better performance',
        'Migrating a legacy codebase to TypeScript',
        'CI/CD pipelines that scale - our approach',
        'Understanding async/await under the hood',
        'GraphQL vs REST - when to use what',
        'Building accessible web applications',
        'The architecture behind our notification system',
        'How we reduced our API response time by 80%',
        'State management patterns in modern React',
        'Introduction to PostgreSQL full-text search',
        'Building a CLI tool with Node.js',
        'Web security essentials every developer should know',
        'How to conduct effective code reviews',
        'Understanding the event loop in Node.js',
        'Deploying to Kubernetes - a practical guide',
        'Building real-time dashboards with SSE',
        'The art of debugging complex systems',
        'How I automated my development workflow',
        'Introduction to system design interviews',
        'Building a rate limiter from scratch',
        'Understanding database transactions and isolation levels',
        'Machine learning for web developers',
        'Building a search engine with Elasticsearch',
        'How to handle errors gracefully in production',
        'The complete guide to HTTP caching',
        'Introduction to WebAssembly for JavaScript devs',
        'Building mobile apps with React Native',
        'Microservices vs Monolith - our experience',
        'How to design APIs that developers love',
        'Understanding OAuth 2.0 and OpenID Connect',
        'Building a job queue with Redis',
        'The psychology of great developer experience',
        'How we handle millions of WebSocket connections',
        'Introduction to functional programming in JavaScript',
        'Building a real-time chat application',
        'Career advice for aspiring developers'
    ];
    
    post_contents TEXT[] := ARRAY[
        E'After months of working on this project, I wanted to share what I learned.\n\n## The Challenge\n\nWe needed to build a system that could handle thousands of concurrent users while maintaining low latency. The initial approach using polling was not going to cut it.\n\n## Our Solution\n\nWe implemented a WebSocket-based architecture with the following key components:\n\n1. **Connection Management**: Using a connection pool with heartbeat monitoring\n2. **Message Queuing**: Redis pub/sub for distributing messages\n3. **State Synchronization**: CRDT-based conflict resolution\n\n## Results\n\nThe system now handles 10x more users with 50ms average latency. Would love to hear your thoughts!',
        
        E'TypeScript generics can be intimidating at first, but they are incredibly powerful once you understand them.\n\n## Basic Generics\n\n```typescript\nfunction identity<T>(arg: T): T {\n  return arg;\n}\n```\n\n## Constraints\n\nYou can constrain generics to ensure they have certain properties:\n\n```typescript\ninterface HasLength {\n  length: number;\n}\n\nfunction logLength<T extends HasLength>(arg: T): void {\n  console.log(arg.length);\n}\n```\n\n## Conditional Types\n\nThis is where things get really interesting. Let me know if you want a deeper dive!',
        
        E'I have been using Redux for years, but recently switched our team to Zustand. Here is why:\n\n## Less Boilerplate\n\nZustand requires significantly less code to set up. No actions, reducers, or action types needed.\n\n## Better TypeScript Support\n\nThe type inference in Zustand is excellent out of the box.\n\n## Performance\n\nZustand only re-renders components that actually use the changed state.\n\n## Our Migration Strategy\n\n1. Started with new features using Zustand\n2. Gradually migrated existing Redux slices\n3. Removed Redux after 3 months\n\nTotal migration time: 3 months with a team of 5 developers.',
        
        E'Building our first GraphQL API taught us many lessons that I wish I knew beforehand.\n\n## What Went Well\n\n- **Type Safety**: The schema-first approach caught many bugs early\n- **Developer Experience**: The playground made testing a breeze\n- **Flexible Queries**: Clients could request exactly what they needed\n\n## Challenges We Faced\n\n- **N+1 Queries**: DataLoader was essential\n- **Caching**: More complex than REST\n- **File Uploads**: Required additional configuration\n\n## Key Takeaways\n\nStart simple, add complexity as needed. Do not try to implement everything at once.',
        
        E'Three years ago, I was struggling to understand basic JavaScript. Today, I am leading a team of engineers. Here is what I learned:\n\n## Year 1: Foundation\n\n- Focused on fundamentals\n- Built projects every week\n- Read code from open source projects\n\n## Year 2: Growth\n\n- Took on challenging projects\n- Mentored new developers\n- Started contributing to open source\n\n## Year 3: Leadership\n\n- Led technical decisions\n- Improved team processes\n- Continued learning new technologies\n\n## Advice for Juniors\n\n1. Be curious and ask questions\n2. Build things, lots of things\n3. Find mentors and learn from them',
        
        E'React Server Components are changing how we build React applications. Here is what you need to know:\n\n## What Are Server Components?\n\nComponents that render on the server and send HTML to the client. No JavaScript bundle for these components!\n\n## Benefits\n\n- Smaller bundle sizes\n- Direct database access\n- Better SEO\n- Faster initial load\n\n## When to Use Them\n\n- Data fetching\n- Static content\n- Large dependencies\n\n## When to Use Client Components\n\n- Interactivity\n- Browser APIs\n- State management',
        
        E'After running Docker in production for 3 years, here are our best practices:\n\n## Image Optimization\n\n1. Use multi-stage builds\n2. Minimize layers\n3. Use specific tags, not latest\n\n## Security\n\n- Run as non-root user\n- Scan images for vulnerabilities\n- Use secrets management\n\n## Orchestration\n\n- Use health checks\n- Implement graceful shutdown\n- Set resource limits\n\n## Logging\n\n- Log to stdout\n- Use structured logging\n- Centralize log aggregation',
        
        E'After working on several large Node.js applications, I have developed a structure that scales well:\n\n## Directory Structure\n\n```\nsrc/\n├── modules/\n│   ├── users/\n│   │   ├── users.controller.ts\n│   │   ├── users.service.ts\n│   │   ├── users.repository.ts\n│   │   └── users.types.ts\n│   └── posts/\n├── shared/\n│   ├── database/\n│   ├── middleware/\n│   └── utils/\n└── config/\n```\n\n## Key Principles\n\n1. Feature-based organization\n2. Clear separation of concerns\n3. Dependency injection\n4. Consistent naming conventions'
    ];
    
    thread_types thread_type[] := ARRAY['DISCUSSION', 'QUESTION', 'ANNOUNCEMENT'];
    
    user_ids UUID[];
    topic_ids UUID[];
    selected_user UUID;
    post_id UUID;
    content_idx INTEGER;
    i INTEGER;
    j INTEGER;
BEGIN
    -- Get all user IDs
    SELECT array_agg(id) INTO user_ids FROM users;
    
    -- Get all topic IDs
    SELECT array_agg(id) INTO topic_ids FROM topics;
    
    FOR i IN 1..50 LOOP
        -- Select random user
        selected_user := user_ids[1 + (random() * (array_length(user_ids, 1) - 1))::int];
        
        -- Select content (cycle through available contents)
        content_idx := 1 + ((i - 1) % array_length(post_contents, 1));
        
        INSERT INTO posts (author_id, title, content, thread_type, views, is_pinned, created_at)
        VALUES (
            selected_user,
            post_titles[i],
            post_contents[content_idx],
            thread_types[1 + (random() * 2)::int],
            (random() * 5000)::int,
            i <= 3, -- First 3 posts are pinned
            NOW() - (random() * 180 || ' days')::interval
        ) RETURNING id INTO post_id;
        
        -- Add 1-3 random topics to each post
        FOR j IN 1..(1 + (random() * 2)::int) LOOP
            INSERT INTO post_topics (post_id, topic_id)
            VALUES (post_id, topic_ids[1 + (random() * (array_length(topic_ids, 1) - 1))::int])
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- COMMENTS (2-3 per post, ~125 total)
-- ============================================================================
DO $$
DECLARE
    comment_templates TEXT[] := ARRAY[
        'Great post! I have been using a similar approach and it works really well.',
        'Thanks for sharing. One question: how do you handle edge cases with %s?',
        'This is exactly what I was looking for. Bookmarked!',
        'Interesting perspective. Have you considered using %s instead?',
        'I disagree with the point about %s. In my experience, it actually causes more problems.',
        'Love this breakdown. Would be great to see a follow-up on advanced topics.',
        'We implemented something similar at my company. The key insight was about %s.',
        'Nice write-up! A few things I would add: caching, error handling, and monitoring.',
        'This saved me hours of debugging. Thank you!',
        'I have a different take on this. Let me explain my reasoning...',
        'Have you benchmarked this against the alternative approaches?',
        'Solid advice. I wish I had read this before starting my project.',
        'The code examples are really helpful. Could you share the full repo?',
        'Great explanation! One thing to note: this might not work in all cases.',
        'I have been following your work for a while. Always quality content!',
        'This approach has some limitations when dealing with %s. Thoughts?',
        'Finally, someone explains this clearly. Thanks!',
        'Interesting! How does this scale when you have millions of users?',
        'We tried this and ran into issues with %s. How did you solve that?',
        'Bookmarking this for later. Really comprehensive guide.',
        'Could you elaborate on the %s part? I am a bit confused.',
        'This is brilliant. Implementing this in my current project right now.',
        'Good points, but I think you missed an important aspect about security.',
        'I have seen similar patterns in other frameworks. Nice to see it in this context.',
        'This deserves more upvotes. Quality content!',
        'One minor correction: the syntax changed in the latest version.',
        'Perfect timing! I was just struggling with this exact problem.',
        'Thanks for the detailed explanation. The diagrams would be helpful.',
        'I respectfully disagree with some points, but overall a good read.',
        'Sharing this with my team. This is exactly what we needed.'
    ];
    
    reply_templates TEXT[] := ARRAY[
        'Great point! I had not thought about it that way.',
        'Exactly! This is what I was trying to say.',
        'Could you elaborate more on this? I am curious about the details.',
        'I see your point, but have you considered the trade-offs?',
        'Thanks for the clarification. That makes more sense now.',
        'This is a really insightful observation.',
        'I had a similar experience. The solution was to %s.',
        'Good question! Let me try to explain...',
        'Interesting perspective. I will have to think about this more.',
        'You are right. I should have mentioned that in the original post.'
    ];
    
    tech_terms TEXT[] := ARRAY[
        'concurrency', 'caching', 'authentication', 'rate limiting', 'error handling',
        'TypeScript', 'async operations', 'database connections', 'memory management',
        'WebSockets', 'GraphQL subscriptions', 'microservices', 'containerization'
    ];
    
    post_rec RECORD;
    user_ids UUID[];
    selected_user UUID;
    parent_comment_id UUID;
    comment_content TEXT;
    num_comments INTEGER;
    num_replies INTEGER;
    i INTEGER;
    j INTEGER;
BEGIN
    -- Get all user IDs
    SELECT array_agg(id) INTO user_ids FROM users;
    
    -- Loop through each post
    FOR post_rec IN SELECT id FROM posts LOOP
        -- 2-3 top-level comments per post
        num_comments := 2 + (random() * 1)::int;
        
        FOR i IN 1..num_comments LOOP
            -- Select random user (different from post author)
            selected_user := user_ids[1 + (random() * (array_length(user_ids, 1) - 1))::int];
            
            -- Generate comment content
            comment_content := format(
                comment_templates[1 + (random() * (array_length(comment_templates, 1) - 1))::int],
                tech_terms[1 + (random() * (array_length(tech_terms, 1) - 1))::int]
            );
            
            INSERT INTO comments (post_id, author_id, content, created_at)
            VALUES (
                post_rec.id,
                selected_user,
                comment_content,
                NOW() - (random() * 90 || ' days')::interval
            ) RETURNING id INTO parent_comment_id;
            
            -- 0-2 replies to this comment
            num_replies := (random() * 2)::int;
            
            FOR j IN 1..num_replies LOOP
                selected_user := user_ids[1 + (random() * (array_length(user_ids, 1) - 1))::int];
                
                comment_content := format(
                    reply_templates[1 + (random() * (array_length(reply_templates, 1) - 1))::int],
                    tech_terms[1 + (random() * (array_length(tech_terms, 1) - 1))::int]
                );
                
                INSERT INTO comments (post_id, parent_id, author_id, content, created_at)
                VALUES (
                    post_rec.id,
                    parent_comment_id,
                    selected_user,
                    comment_content,
                    NOW() - (random() * 60 || ' days')::interval
                );
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- VOTES (randomized on posts and comments)
-- ============================================================================
DO $$
DECLARE
    user_rec RECORD;
    post_rec RECORD;
    comment_rec RECORD;
    vote_chance FLOAT;
    upvote_bias FLOAT;
BEGIN
    -- Vote on posts
    FOR user_rec IN SELECT id FROM users LOOP
        FOR post_rec IN SELECT id FROM posts LOOP
            vote_chance := random();
            
            -- 40% chance to vote on a post
            IF vote_chance < 0.4 THEN
                -- 75% upvote, 25% downvote bias
                upvote_bias := random();
                
                INSERT INTO votes (user_id, votable_id, votable_type, vote_type, created_at)
                VALUES (
                    user_rec.id,
                    post_rec.id,
                    'post',
                    CASE WHEN upvote_bias < 0.75 THEN 'UPVOTE' ELSE 'DOWNVOTE' END,
                    NOW() - (random() * 90 || ' days')::interval
                )
                ON CONFLICT (user_id, votable_id, votable_type) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
    
    -- Vote on comments
    FOR user_rec IN SELECT id FROM users LOOP
        FOR comment_rec IN SELECT id FROM comments LOOP
            vote_chance := random();
            
            -- 25% chance to vote on a comment
            IF vote_chance < 0.25 THEN
                upvote_bias := random();
                
                INSERT INTO votes (user_id, votable_id, votable_type, vote_type, created_at)
                VALUES (
                    user_rec.id,
                    comment_rec.id,
                    'comment',
                    CASE WHEN upvote_bias < 0.70 THEN 'UPVOTE' ELSE 'DOWNVOTE' END,
                    NOW() - (random() * 60 || ' days')::interval
                )
                ON CONFLICT (user_id, votable_id, votable_type) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- FOLLOWS (random follow relationships)
-- ============================================================================
DO $$
DECLARE
    user_ids UUID[];
    follower UUID;
    following UUID;
    i INTEGER;
    j INTEGER;
    num_follows INTEGER;
BEGIN
    SELECT array_agg(id) INTO user_ids FROM users;
    
    -- Each user follows 5-15 other users
    FOR i IN 1..array_length(user_ids, 1) LOOP
        num_follows := 5 + (random() * 10)::int;
        
        FOR j IN 1..num_follows LOOP
            follower := user_ids[i];
            following := user_ids[1 + (random() * (array_length(user_ids, 1) - 1))::int];
            
            IF follower != following THEN
                INSERT INTO follows (follower_id, following_id, created_at)
                VALUES (follower, following, NOW() - (random() * 180 || ' days')::interval)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- BOOKMARKS (random bookmarks)
-- ============================================================================
DO $$
DECLARE
    user_rec RECORD;
    post_rec RECORD;
    bookmark_chance FLOAT;
BEGIN
    FOR user_rec IN SELECT id FROM users LOOP
        FOR post_rec IN SELECT id FROM posts LOOP
            bookmark_chance := random();
            
            -- 10% chance to bookmark a post
            IF bookmark_chance < 0.1 THEN
                INSERT INTO bookmarks (user_id, post_id, created_at)
                VALUES (user_rec.id, post_rec.id, NOW() - (random() * 90 || ' days')::interval)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- USER TOPIC SUBSCRIPTIONS
-- ============================================================================
DO $$
DECLARE
    user_rec RECORD;
    topic_rec RECORD;
    subscribe_chance FLOAT;
BEGIN
    FOR user_rec IN SELECT id FROM users LOOP
        FOR topic_rec IN SELECT id FROM topics LOOP
            subscribe_chance := random();
            
            -- 30% chance to subscribe to a topic
            IF subscribe_chance < 0.3 THEN
                INSERT INTO user_topics (user_id, topic_id, subscribed_at)
                VALUES (user_rec.id, topic_rec.id, NOW() - (random() * 180 || ' days')::interval)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- UPDATE TOPIC SUBSCRIBER COUNTS
-- ============================================================================
UPDATE topics t
SET subscriber_count = (
    SELECT COUNT(*) FROM user_topics ut WHERE ut.topic_id = t.id
);

-- ============================================================================
-- SUMMARY OUTPUT
-- ============================================================================
DO $$
DECLARE
    user_count INTEGER;
    post_count INTEGER;
    comment_count INTEGER;
    vote_count INTEGER;
    topic_count INTEGER;
    follow_count INTEGER;
    bookmark_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO post_count FROM posts;
    SELECT COUNT(*) INTO comment_count FROM comments;
    SELECT COUNT(*) INTO vote_count FROM votes;
    SELECT COUNT(*) INTO topic_count FROM topics;
    SELECT COUNT(*) INTO follow_count FROM follows;
    SELECT COUNT(*) INTO bookmark_count FROM bookmarks;
    
    RAISE NOTICE '=== SEED COMPLETE ===';
    RAISE NOTICE 'Users: %', user_count;
    RAISE NOTICE 'Posts: %', post_count;
    RAISE NOTICE 'Comments: %', comment_count;
    RAISE NOTICE 'Votes: %', vote_count;
    RAISE NOTICE 'Topics: %', topic_count;
    RAISE NOTICE 'Follows: %', follow_count;
    RAISE NOTICE 'Bookmarks: %', bookmark_count;
END $$;





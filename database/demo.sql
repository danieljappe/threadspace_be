-- ============================================================================
-- THREADSPACE DEMO DISCUSSION DATA
-- A focused discussion thread perfect for live demos
-- ============================================================================

-- Clear existing data (optional - comment out if you want to keep existing data)
-- TRUNCATE TABLE votes, bookmarks, notifications, post_topics, comments, posts, user_topics, follows CASCADE;
-- DELETE FROM users WHERE username NOT IN ('admin');

-- ============================================================================
-- TOPICS (Course-relevant topics)
-- ============================================================================
INSERT INTO topics (name, slug, description, color) VALUES
('GraphQL', 'graphql', 'GraphQL API discussions, schemas, and resolvers', '#E10098'),
('React', 'react', 'React.js components, hooks, and ecosystem', '#61DAFB'),
('Web Security', 'web-security', 'Security best practices: XSS, CSRF, authentication', '#FF4136'),
('TypeScript', 'typescript', 'TypeScript discussions and best practices', '#3178C6'),
('Node.js', 'nodejs', 'Server-side JavaScript with Node.js', '#339933'),
('State Management', 'state-management', 'React Query, Context API, and state patterns', '#9B59B6')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- DEMO USERS
-- ============================================================================
INSERT INTO users (username, email, password_hash, bio, is_verified, reputation) VALUES
('alex_dev', 'alex@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXQxq0M6Kj6e', 'Full-stack developer passionate about GraphQL and React', true, 45),
('sarah_coder', 'sarah@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXQxq0M6Kj6e', 'Security engineer and React enthusiast', true, 38),
('mike_tech', 'mike@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXQxq0M6Kj6e', 'Backend developer specializing in Node.js and GraphQL', true, 52),
('jessica_web', 'jessica@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXQxq0M6Kj6e', 'Frontend developer | TypeScript advocate | Open source contributor', true, 41),
('david_arch', 'david@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXQxq0M6Kj6e', 'Software architect | System design enthusiast', true, 67),
('emma_sec', 'emma@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXQxq0M6Kj6e', 'Security researcher | Web security specialist', true, 59)
ON CONFLICT (username) DO NOTHING;

-- ============================================================================
-- MAIN DEMO POST: "Building a Secure GraphQL API with React Frontend"
-- ============================================================================
DO $$
DECLARE
    alex_id UUID;
    graphql_topic_id UUID;
    react_topic_id UUID;
    security_topic_id UUID;
    main_post_id UUID;
    comment_id UUID;
    reply_id UUID;
    sarah_id UUID;
    mike_id UUID;
    jessica_id UUID;
    david_id UUID;
    emma_id UUID;
BEGIN
    -- Get user IDs
    SELECT id INTO alex_id FROM users WHERE username = 'alex_dev';
    SELECT id INTO sarah_id FROM users WHERE username = 'sarah_coder';
    SELECT id INTO mike_id FROM users WHERE username = 'mike_tech';
    SELECT id INTO jessica_id FROM users WHERE username = 'jessica_web';
    SELECT id INTO david_id FROM users WHERE username = 'david_arch';
    SELECT id INTO emma_id FROM users WHERE username = 'emma_sec';
    
    -- Get topic IDs
    SELECT id INTO graphql_topic_id FROM topics WHERE slug = 'graphql';
    SELECT id INTO react_topic_id FROM topics WHERE slug = 'react';
    SELECT id INTO security_topic_id FROM topics WHERE slug = 'web-security';
    
    -- Create main post
    INSERT INTO posts (author_id, title, content, thread_type, views, is_pinned, created_at)
    VALUES (
        alex_id,
        'Building a Secure GraphQL API with React Frontend - Best Practices?',
        E'Hi everyone! I''m working on a project for my course and need some advice on building a secure GraphQL API with a React frontend.\n\n## My Current Setup\n\n- **Backend**: Node.js with GraphQL (using Apollo Server)\n- **Frontend**: React with Apollo Client\n- **Authentication**: JWT tokens stored in HTTP-only cookies\n- **Database**: PostgreSQL\n\n## Questions I Have\n\n1. **Security Concerns**: How do I protect against common vulnerabilities like SQL injection, XSS, and CSRF attacks in GraphQL?\n\n2. **State Management**: Should I use React Query for caching, or stick with Apollo Client''s built-in caching? What are the trade-offs?\n\n3. **Error Handling**: What''s the best way to handle errors in GraphQL resolvers and display them in React?\n\n4. **Pagination**: I need to implement pagination for posts. Should this be done on the backend or frontend?\n\n5. **Real-time Updates**: I want to add real-time features. Should I use GraphQL subscriptions or WebSockets?\n\nAny advice or examples would be greatly appreciated! Thanks in advance.',
        'QUESTION',
        342,
        true,
        NOW() - INTERVAL '2 days'
    ) RETURNING id INTO main_post_id;
    
    -- Link topics to post
    INSERT INTO post_topics (post_id, topic_id) VALUES
    (main_post_id, graphql_topic_id),
    (main_post_id, react_topic_id),
    (main_post_id, security_topic_id)
    ON CONFLICT DO NOTHING;
    
    -- ============================================================================
    -- COMMENTS AND REPLIES
    -- ============================================================================
    
    -- Comment 1: Sarah on Security
    INSERT INTO comments (post_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        sarah_id,
        E'Great questions! Let me address the security concerns:\n\n**SQL Injection**: Since you''re using GraphQL, make sure you''re using parameterized queries in your resolvers. Never concatenate user input directly into SQL queries. If you''re using Prisma or another ORM, this is handled automatically.\n\n**XSS Protection**: On the frontend, always sanitize user input before rendering. React automatically escapes content, but be careful with `dangerouslySetInnerHTML`. Use libraries like DOMPurify if you need to render HTML.\n\n**CSRF Protection**: Since you''re using HTTP-only cookies, you''re on the right track! Make sure to:\n- Set `SameSite=Strict` or `SameSite=Lax` on your cookies\n- Use CSRF tokens for state-changing operations\n- Validate the Origin header on your backend\n\nFor GraphQL specifically, consider implementing query depth limiting and query cost analysis to prevent DoS attacks.',
        NOW() - INTERVAL '1 day 18 hours'
    ) RETURNING id INTO comment_id;
    
    -- Reply to Sarah's comment
    INSERT INTO comments (post_id, parent_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        comment_id,
        alex_id,
        'Thanks Sarah! The CSRF token approach makes sense. Do you have any recommendations for libraries that handle this automatically in Node.js?',
        NOW() - INTERVAL '1 day 16 hours'
    );
    
    -- Reply to Alex's reply
    INSERT INTO comments (post_id, parent_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        comment_id,
        emma_id,
        'I''d recommend using `csurf` middleware for Express, or if you''re using Apollo Server, you can implement it in your context function. The key is generating a token on GET requests and validating it on POST/mutations.',
        NOW() - INTERVAL '1 day 15 hours'
    );
    
    -- Comment 2: Mike on State Management
    INSERT INTO comments (post_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        mike_id,
        E'Regarding state management:\n\n**Apollo Client vs React Query**:\n\nApollo Client is great if you''re all-in on GraphQL. It handles:\n- Automatic caching\n- Cache normalization\n- Optimistic updates\n- Subscriptions\n\nReact Query is more flexible and works with any API (REST, GraphQL, etc.). It has:\n- Better stale time / cache time control\n- Simpler API for basic use cases\n- Great retry mechanisms\n\n**My Recommendation**: Since you''re using GraphQL, stick with Apollo Client for now. It''s designed specifically for GraphQL and handles subscriptions out of the box. You can always add React Query later for non-GraphQL endpoints.\n\nFor caching strategy, I''d suggest:\n- `cache-first` for posts (they don''t change often)\n- `network-only` for mutations\n- `cache-and-network` for real-time data',
        NOW() - INTERVAL '1 day 12 hours'
    ) RETURNING id INTO comment_id;
    
    -- Reply to Mike
    INSERT INTO comments (post_id, parent_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        comment_id,
        jessica_id,
        'I agree with Mike! One thing to add: Apollo Client''s cache policies are really powerful. You can set `fetchPolicy` and `nextFetchPolicy` per query, which gives you fine-grained control. The `cache-and-network` policy is perfect for your use case where you want to show cached data immediately but also get fresh data.',
        NOW() - INTERVAL '1 day 10 hours'
    );
    
    -- Comment 3: David on Pagination
    INSERT INTO comments (post_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        david_id,
        E'**Pagination should definitely be done on the backend!**\n\nHere''s why:\n\n1. **Performance**: Loading all posts and paginating on the frontend would be terrible for large datasets\n2. **Network Efficiency**: Only fetch what you need\n3. **Database Optimization**: Use database indexes (which you mentioned in your requirements) to make pagination queries fast\n\n**GraphQL Pagination Patterns**:\n\nI recommend using **cursor-based pagination** (also called "keyset pagination") instead of offset-based:\n\nraphql\ntype PostConnection {\n  edges: [PostEdge!]!\n  pageInfo: PageInfo!\n}\n\ntype PostEdge {\n  node: Post!\n  cursor: String!\n}\n```\n\nCursor-based pagination is more efficient because:\n- It doesn''t skip rows (offset can be slow on large tables)\n- It handles new data better (no duplicate/missing items)\n- It works well with database indexes\n\nFor your PostgreSQL setup, you''d query like:\n\nSELECT * FROM posts \nWHERE created_at < $cursor \nORDER BY created_at DESC \nLIMIT $limit;\n```',
        NOW() - INTERVAL '1 day 8 hours'
    ) RETURNING id INTO comment_id;
    
    -- Reply to David
    INSERT INTO comments (post_id, parent_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        comment_id,
        alex_id,
        'This is super helpful! I was planning to use offset-based pagination, but cursor-based makes much more sense. Do you have any examples of implementing this in GraphQL resolvers?',
        NOW() - INTERVAL '1 day 6 hours'
    );
    
    -- Comment 4: Jessica on Error Handling
    INSERT INTO comments (post_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        jessica_id,
        E'For error handling in GraphQL:\n\n**Backend (Resolvers)**:\n\nUse GraphQL''s built-in error handling. Create custom error classes:\n\nript\nclass ValidationError extends Error {\n  constructor(message: string) {\n    super(message);\n    this.name = ''ValidationError'';\n  }\n}\n\n// In your resolver\nif (!user) {\n  throw new ValidationError(''User not found'');\n}\n```\n\nThen format errors in your Apollo Server:\n\nformatError: (err) => {\n  if (err.originalError instanceof ValidationError) {\n    return { message: err.message, code: ''VALIDATION_ERROR'' };\n  }\n  return { message: ''Internal server error'', code: ''INTERNAL_ERROR'' };\n}\n```\n\n**Frontend (React)**:\n\nApollo Client provides error handling in the `useQuery` hook:\n\n\nconst { data, loading, error } = useQuery(GET_POSTS);\n\nif (error) {\n  // Handle different error types\n  if (error.graphQLErrors?.[0]?.extensions?.code === ''VALIDATION_ERROR'') {\n    // Show user-friendly message\n  }\n}\n```\n\nAlso consider using React Error Boundaries for catching rendering errors!',
        NOW() - INTERVAL '1 day 4 hours'
    ) RETURNING id INTO comment_id;
    
    -- Comment 5: Emma on Real-time Updates
    INSERT INTO comments (post_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        emma_id,
        E'For real-time updates, I''d recommend **GraphQL Subscriptions** over raw WebSockets:\n\n**Why GraphQL Subscriptions?**\n\n1. **Type Safety**: Same schema, same types as queries/mutations\n2. **Apollo Integration**: Works seamlessly with Apollo Client/Server\n3. **Filtering**: You can filter subscriptions on the backend\n4. **Consistency**: One API for everything\n\n**Implementation**:\n\nOn the backend, use `graphql-subscriptions` with a PubSub engine (Redis is great for production):\n\n\nconst pubsub = new RedisPubSub();\n\nconst resolvers = {\n  Subscription: {\n    postUpdated: {\n      subscribe: () => pubsub.asyncIterator([''POST_UPDATED'']),\n    },\n  },\n  Mutation: {\n    updatePost: async (_, { id, content }) => {\n      const post = await updatePost(id, content);\n      pubsub.publish(''POST_UPDATED'', { postUpdated: post });\n      return post;\n    },\n  },\n};\n```\n\nOn the frontend:\n\nconst { data } = useSubscription(POST_UPDATED_SUBSCRIPTION);\n```\n\n**When to use WebSockets directly**: Only if you need something GraphQL subscriptions can''t handle, like binary data or very custom protocols.',
        NOW() - INTERVAL '1 day 2 hours'
    ) RETURNING id INTO comment_id;
    
    -- Reply to Emma
    INSERT INTO comments (post_id, parent_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        comment_id,
        mike_id,
        'Great explanation! One thing to add: for your course demo, you could start with the in-memory PubSub that Apollo Server provides, then mention that in production you''d use Redis. It''s much simpler to set up for demos.',
        NOW() - INTERVAL '1 day 1 hour'
    );
    
    -- Comment 6: Alex (follow-up)
    INSERT INTO comments (post_id, author_id, content, created_at)
    VALUES (
        main_post_id,
        alex_id,
        E'Wow, thank you all so much for the detailed responses! This is exactly what I needed.\n\n**Summary of what I''ll implement**:\n\n1. ✅ CSRF protection with `csurf` middleware\n2. ✅ Stick with Apollo Client for state management\n3. ✅ Cursor-based pagination on the backend\n4. ✅ Custom error classes with proper formatting\n5. ✅ GraphQL subscriptions with in-memory PubSub (for demo)\n\nI''ll make sure to:\n- Add proper indexes to my PostgreSQL tables for pagination\n- Use parameterized queries (Prisma handles this)\n- Sanitize all user input\n- Set up proper CORS configuration\n- Implement logging (maybe Sentry as mentioned in requirements)\n\nI''ll update this thread once I have it working. Thanks again everyone! 🚀',
        NOW() - INTERVAL '20 hours'
    );
    
    -- ============================================================================
    -- VOTES (Make it look realistic)
    -- ============================================================================
    
    -- Votes on main post
    INSERT INTO votes (user_id, votable_id, votable_type, vote_type) VALUES
    (sarah_id, main_post_id, 'post', 'UPVOTE'),
    (mike_id, main_post_id, 'post', 'UPVOTE'),
    (jessica_id, main_post_id, 'post', 'UPVOTE'),
    (david_id, main_post_id, 'post', 'UPVOTE'),
    (emma_id, main_post_id, 'post', 'UPVOTE')
    ON CONFLICT DO NOTHING;
    
    -- Votes on comments (get comment IDs)
    FOR comment_id IN SELECT id FROM comments WHERE post_id = main_post_id AND parent_id IS NULL LOOP
        -- Random upvotes on top-level comments
        INSERT INTO votes (user_id, votable_id, votable_type, vote_type)
        SELECT id, comment_id, 'comment', 'UPVOTE'
        FROM users
        WHERE id != (SELECT author_id FROM comments WHERE id = comment_id)
        ORDER BY random()
        LIMIT 2 + (random() * 3)::int
        ON CONFLICT DO NOTHING;
    END LOOP;
    
    -- Update topic subscriber counts
    UPDATE topics t
    SET subscriber_count = (
        SELECT COUNT(*) FROM user_topics ut WHERE ut.topic_id = t.id
    );
    
    RAISE NOTICE 'Demo discussion created successfully!';
    RAISE NOTICE 'Post ID: %', main_post_id;
END $$;This creates:

1. 6 demo users with realistic profiles
2. 6 course-relevant topics (GraphQL, React, Web Security, TypeScript, Node.js, State Management)
3. 1 main post: "Building a Secure GraphQL API with React Frontend - Best Practices?"
4. 6 top-level comments covering:
   - Security (SQL injection, XSS, CSRF)
   - State management (Apollo vs React Query)
   - Pagination (backend vs frontend)
   - Error handling
   - Real-time updates (GraphQL subscriptions)
   - Follow-up summary
5. 4 replies forming a discussion thread
6. Votes on the post and comments

The discussion aligns with your course requirements (GraphQL, React, Security, State Management, Pagination, etc.) and is suitable for a live demo.

To use this, save it as a SQL file (e.g., `demo-discussion.sql`) and run it against your database. It uses `ON CONFLICT DO NOTHING` so it's safe to run multiple times.
# GraphQL Test Queries for Apollo Sandbox

Use these queries in Apollo Sandbox at `http://localhost:4000/graphql`

## 1. Health Check (Simple Test)
```graphql
query HealthCheck {
  health
}
```

## 2. Get All Posts (Find a Post ID)
```graphql
query GetPosts {
  posts(first: 5, orderBy: NEWEST) {
    edges {
      node {
        id
        title
        author {
          id
          username
        }
        createdAt
      }
      cursor
    }
    pageInfo {
      hasNextPage
    }
    totalCount
  }
}
```

## 3. Get Single Post (Full Details)
Replace `POST_ID` with an actual post ID from query #2
```graphql
query GetPost($id: ID!) {
  post(id: $id) {
    id
    title
    content
    threadType
    views
    isPinned
    isLocked
    createdAt
    updatedAt
    author {
      id
      username
      email
      bio
      avatarUrl
      reputation
      isVerified
    }
    topics {
      id
      name
      slug
      color
    }
    voteCount
    userVote
    bookmarked
    comments(first: 10, orderBy: NEWEST) {
      edges {
        node {
          id
          content
          depth
          isEdited
          createdAt
          updatedAt
          author {
            id
            username
            avatarUrl
            reputation
          }
          post {
            id
            title
          }
          parent {
            id
            content
          }
          voteCount
          userVote
          replies(first: 5) {
            edges {
              node {
                id
                content
                depth
                author {
                  id
                  username
                }
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
      totalCount
    }
  }
}
```

Variables:
```json
{
  "id": "POST_ID_HERE"
}
```

## 4. Get Comments for a Post
Replace `POST_ID` with an actual post ID
```graphql
query GetComments($postId: ID!) {
  comments(postId: $postId, first: 10, orderBy: NEWEST) {
    edges {
      node {
        id
        content
        depth
        isEdited
        createdAt
        updatedAt
        author {
          id
          username
          avatarUrl
          reputation
        }
        post {
          id
          title
        }
        parent {
          id
          content
        }
        voteCount
        userVote
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
    totalCount
  }
}
```

Variables:
```json
{
  "postId": "POST_ID_HERE"
}
```

## 5. Get Single Comment
Replace `COMMENT_ID` with an actual comment ID
```graphql
query GetComment($id: ID!) {
  comment(id: $id) {
    id
    content
    depth
    isEdited
    createdAt
    updatedAt
    author {
      id
      username
      avatarUrl
      reputation
    }
    post {
      id
      title
    }
    parent {
      id
      content
      author {
        id
        username
      }
    }
    voteCount
    userVote
    replies(first: 5) {
      edges {
        node {
          id
          content
          author {
            id
            username
          }
        }
      }
    }
  }
}
```

Variables:
```json
{
  "id": "COMMENT_ID_HERE"
}
```

## 6. Test Trending Posts
```graphql
query GetTrendingPosts {
  trendingPosts(first: 5) {
    id
    title
    content
    views
    author {
      id
      username
    }
    voteCount
    createdAt
  }
}
```

## 7. Get Posts by Topic
First, get a topic ID:
```graphql
query GetTopics {
  topics(first: 5) {
    edges {
      node {
        id
        name
        slug
      }
    }
  }
}
```

Then use the topic ID:
```graphql
query GetPostsByTopic($topicId: ID!) {
  posts(topicId: $topicId, first: 10, orderBy: NEWEST) {
    edges {
      node {
        id
        title
        content
        author {
          id
          username
        }
        topics {
          id
          name
        }
        voteCount
        createdAt
      }
    }
  }
}
```

Variables:
```json
{
  "topicId": "TOPIC_ID_HERE"
}
```

## 8. Diagnostic Query - Minimal Post
```graphql
query MinimalPost($id: ID!) {
  post(id: $id) {
    id
    title
    content
  }
}
```

Variables:
```json
{
  "id": "POST_ID_HERE"
}
```

## 9. Diagnostic Query - Post with Author Only
```graphql
query PostWithAuthor($id: ID!) {
  post(id: $id) {
    id
    title
    author {
      id
      username
    }
  }
}
```

Variables:
```json
{
  "id": "POST_ID_HERE"
}
```

## 10. Diagnostic Query - Post with Comments Only
```graphql
query PostWithComments($id: ID!) {
  post(id: $id) {
    id
    title
    comments(first: 5) {
      edges {
        node {
          id
          content
        }
      }
      totalCount
    }
  }
}
```

Variables:
```json
{
  "id": "POST_ID_HERE"
}
```

## Troubleshooting Steps

1. **Start with query #1** (Health Check) - This verifies the server is running
2. **Then query #2** (Get Posts) - This finds available post IDs
3. **Use query #8** (Minimal Post) - This tests if basic post query works
4. **Gradually add fields** - Use queries #9, #10, then #3 to isolate which field is failing
5. **Check the browser console** - Look for GraphQL errors
6. **Check server logs** - Look for errors in the backend logs

## Common Issues to Check

- **"Post not found"** - The post ID doesn't exist or is deleted
- **"Cannot return null for non-nullable field"** - A required field is missing
- **"Field X doesn't exist"** - Schema mismatch
- **Timeout** - Database connection issue or N+1 query problem



import { gql } from 'graphql-tag';

export const typeDefs = gql`
  scalar DateTime

  type User {
    id: ID!
    username: String!
    email: String!
    bio: String
    avatarUrl: String
    reputation: Int!
    isVerified: Boolean!
    isAdmin: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    lastLogin: DateTime
    isActive: Boolean!
  }

  type Post {
    id: ID!
    author: User!
    title: String!
    content: String!
    threadType: ThreadType!
    views: Int!
    topics: [Topic!]
    comments(first: Int, after: String, orderBy: CommentOrder): CommentConnection!
    voteCount: Int!
    userVote: VoteType
    bookmarked: Boolean!
    isPinned: Boolean!
    isLocked: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Comment {
    id: ID!
    post: Post!
    parent: Comment
    author: User!
    content: String!
    depth: Int!
    replies(first: Int, after: String): CommentConnection!
    voteCount: Int!
    userVote: VoteType
    isEdited: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Topic {
    id: ID!
    name: String!
    slug: String!
    description: String
    color: String
    subscriberCount: Int!
    posts(first: Int, after: String, orderBy: PostOrder): PostConnection!
    isSubscribed: Boolean!
    createdAt: DateTime!
  }

  type PostConnection {
    edges: [PostEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type PostEdge {
    node: Post!
    cursor: String!
  }

  type CommentConnection {
    edges: [CommentEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type CommentEdge {
    node: Comment!
    cursor: String!
  }

  type TopicConnection {
    edges: [TopicEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type TopicEdge {
    node: Topic!
    cursor: String!
  }

  type UserConnection {
    edges: [UserEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type UserEdge {
    node: User!
    cursor: String!
  }

  type NotificationConnection {
    edges: [NotificationEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type NotificationEdge {
    node: Notification!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type AuthPayload {
    user: User!
    accessToken: String!
    refreshToken: String!
  }

  type VotePayload {
    success: Boolean!
    voteCount: Int!
    userVote: VoteType
  }

  enum ThreadType {
    DISCUSSION
    QUESTION
    ANNOUNCEMENT
    POLL
  }

  enum VoteType {
    UPVOTE
    DOWNVOTE
  }

  enum PostOrder {
    NEWEST
    OLDEST
    TRENDING
    TOP
  }

  enum CommentOrder {
    NEWEST
    OLDEST
    TOP
  }

  input RegisterInput {
    username: String!
    email: String!
    password: String!
    bio: String
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input CreatePostInput {
    title: String!
    content: String!
    threadType: ThreadType!
    topicIds: [ID!]
  }

  input UpdatePostInput {
    title: String
    content: String
    threadType: ThreadType
    topicIds: [ID!]
  }

  input CreateCommentInput {
    postId: ID!
    parentId: ID
    content: String!
  }

  input UpdateProfileInput {
    bio: String
    avatarUrl: String
  }

  type Query {
    # Health check
    health: String!
    
    # User queries
    me: User
    user(id: ID!): User
    userByUsername(username: String!): User
    users(search: String, first: Int, after: String): UserConnection!
    
    # Post queries
    post(id: ID!): Post
    posts(
      topicId: ID
      authorId: ID
      search: String
      orderBy: PostOrder
      first: Int
      after: String
    ): PostConnection!
    trendingPosts(first: Int!): [Post!]!
    
    # Topic queries
    topic(id: ID!): Topic
    topicBySlug(slug: String!): Topic
    topics(search: String, first: Int, after: String): TopicConnection!
    
    # Comment queries
    comment(id: ID!): Comment
    comments(postId: ID!, first: Int, after: String, orderBy: CommentOrder): CommentConnection!
    
    # Typing queries
    getTypingUsers(postId: ID!): [TypingUser!]!
    
    # Notification queries
    notifications(first: Int, after: String): NotificationConnection!
    unreadNotificationCount: Int!
  }

  type Mutation {
    # Authentication
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    logout: Boolean!
    refreshToken: AuthPayload!
    
    # User mutations
    updateProfile(input: UpdateProfileInput!): User!
    followUser(userId: ID!): User!
    unfollowUser(userId: ID!): User!
    
    # Post mutations
    createPost(input: CreatePostInput!): Post!
    updatePost(id: ID!, input: UpdatePostInput!): Post!
    deletePost(id: ID!): Boolean!
    
    # Comment mutations
    createComment(input: CreateCommentInput!): Comment!
    updateComment(id: ID!, content: String!): Comment!
    deleteComment(id: ID!): Boolean!
    
    # Voting
    vote(targetId: ID!, targetType: VotableType!, voteType: VoteType!): VotePayload!
    removeVote(targetId: ID!, targetType: VotableType!): Boolean!
    
    # Bookmarks
    bookmarkPost(postId: ID!): Post!
    unbookmarkPost(postId: ID!): Boolean!
    
    # Topics
    subscribeTopic(topicId: ID!): Topic!
    unsubscribeTopic(topicId: ID!): Boolean!
    
    # Typing indicators
    startTyping(postId: ID!): Boolean!
    stopTyping(postId: ID!): Boolean!
    
    # Notifications
    markNotificationAsRead(notificationId: ID!): Notification!
    markAllNotificationsAsRead: Boolean!
  }

  enum VotableType {
    POST
    COMMENT
  }

  type Subscription {
    # Real-time updates
    commentAdded(postId: ID!): Comment!
    postUpdated(postId: ID!): Post!
    postCreated(topicId: ID): Post!
    voteUpdated(postId: ID, commentId: ID): VotePayload!
    notificationReceived: Notification!
    userTyping(postId: ID!): TypingIndicator!
  }

  type Notification {
    id: ID!
    type: String!
    data: String!
    isRead: Boolean!
    createdAt: DateTime!
  }

  type TypingIndicator {
    userId: ID!
    username: String!
    postId: ID!
  }

  type TypingUser {
    userId: ID!
    username: String!
  }
`;

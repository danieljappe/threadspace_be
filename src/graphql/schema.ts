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
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Post {
    id: ID!
    author: User!
    title: String!
    content: String!
    comments(first: Int, after: String, orderBy: CommentOrder): CommentConnection!
    voteCount: Int!
    userVote: VoteType
    bookmarked: Boolean!
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

  enum VoteType {
    UPVOTE
    DOWNVOTE
  }

  enum PostOrder {
    NEWEST
    OLDEST
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
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input CreatePostInput {
    title: String!
    content: String!
  }

  input CreateCommentInput {
    postId: ID!
    parentId: ID
    content: String!
  }

  input UpdatePostInput {
    id: ID!
    title: String
    content: String
  }

  input UpdateCommentInput {
    id: ID!
    content: String!
  }

  type Query {
    # Health check
    health: String!
    
    # User queries
    me: User
    
    # Post queries
    post(id: ID!): Post
    posts(
      orderBy: PostOrder
      first: Int
      after: String
    ): PostConnection!
    bookmarkedPosts(first: Int, after: String, orderBy: PostOrder): PostConnection!
    
    # Comment queries
    comment(id: ID!): Comment
    comments(postId: ID!, first: Int, after: String, orderBy: CommentOrder): CommentConnection!
  }

  type Mutation {
    # Authentication
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    logout: Boolean!
    refreshToken: AuthPayload!
    
    # Post mutations
    createPost(input: CreatePostInput!): Post!
    editPost(input: UpdatePostInput!): Post!
    deletePost(id: ID!): Boolean!
    
    # Comment mutations
    createComment(input: CreateCommentInput!): Comment!
    editComment(input: UpdateCommentInput!): Comment!
    deleteComment(id: ID!): Boolean!
    
    # Voting
    vote(targetId: ID!, targetType: VotableType!, voteType: VoteType!): VotePayload!
    removeVote(targetId: ID!, targetType: VotableType!): Boolean!
    
    # Bookmarks
    bookmarkPost(postId: ID!): Post!
    unbookmarkPost(postId: ID!): Boolean!
  }

  enum VotableType {
    POST
    COMMENT
  }

  type Subscription {
    # Real-time updates
    commentAdded(postId: ID!): Comment!
    voteUpdated(postId: ID, commentId: ID): VotePayload!
  }
`;

import DataLoader from 'dataloader';
import prisma from '../../config/database';
import { logger } from '../../config/logger';

// User DataLoaders
export const createUserLoader = () => {
  return new DataLoader(async (userIds: readonly string[]) => {
    logger.debug('User DataLoader loading:', userIds);
    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } }
    });
    
    const userMap = new Map(users.map(user => [user.id, user]));
    return [...userIds].map(id => userMap.get(id) || null);
  });
};

export const createUserByUsernameLoader = () => {
  return new DataLoader(async (usernames: readonly string[]) => {
    logger.debug('UserByUsername DataLoader loading:', usernames);
    const users = await prisma.user.findMany({
      where: { username: { in: [...usernames] } }
    });
    
    const userMap = new Map(users.map(user => [user.username, user]));
    return [...usernames].map(username => userMap.get(username) || null);
  });
};

// Post DataLoaders
export const createPostLoader = () => {
  return new DataLoader(async (postIds: readonly string[]) => {
    logger.debug('Post DataLoader loading:', postIds);
    const posts = await prisma.post.findMany({
      where: { 
        id: { in: [...postIds] },
        deletedAt: null // Only load non-deleted posts
      }
    });
    
    const postMap = new Map(posts.map(post => [post.id, post]));
    return [...postIds].map(id => postMap.get(id) || null);
  });
};

// Comment DataLoaders
export const createCommentLoader = () => {
  return new DataLoader(async (commentIds: readonly string[]) => {
    logger.debug('Comment DataLoader loading:', commentIds);
    const comments = await prisma.comment.findMany({
      where: { 
        id: { in: [...commentIds] },
        deletedAt: null // Only load non-deleted comments
      }
    });
    
    const commentMap = new Map(comments.map(comment => [comment.id, comment]));
    return [...commentIds].map(id => commentMap.get(id) || null);
  });
};

// Topic DataLoaders
export const createTopicLoader = () => {
  return new DataLoader(async (topicIds: readonly string[]) => {
    logger.debug('Topic DataLoader loading:', topicIds);
    const topics = await prisma.topic.findMany({
      where: { id: { in: [...topicIds] } }
    });
    
    const topicMap = new Map(topics.map(topic => [topic.id, topic]));
    return [...topicIds].map(id => topicMap.get(id) || null);
  });
};

export const createTopicBySlugLoader = () => {
  return new DataLoader(async (slugs: readonly string[]) => {
    logger.debug('TopicBySlug DataLoader loading:', slugs);
    const topics = await prisma.topic.findMany({
      where: { slug: { in: [...slugs] } }
    });
    
    const topicMap = new Map(topics.map(topic => [topic.slug, topic]));
    return [...slugs].map(slug => topicMap.get(slug) || null);
  });
};

// Vote DataLoaders
export const createVoteLoader = () => {
  return new DataLoader<{ userId: string; votableId: string; votableType: 'post' | 'comment' }, any>(async (keys) => {
    logger.debug('Vote DataLoader loading:', keys);
    
    const keysArray = Array.from(keys);
    const votes = await prisma.vote.findMany({
      where: {
        OR: keysArray.map(key => ({
          userId: key.userId,
          votableId: key.votableId,
          votableType: key.votableType
        }))
      }
    });
    
    const voteMap = new Map(
      votes.map(vote => [
        `${vote.userId}-${vote.votableId}-${vote.votableType}`,
        vote
      ])
    );
    
    return keysArray.map(key => 
      voteMap.get(`${key.userId}-${key.votableId}-${key.votableType}`) || null
    );
  });
};

// Bookmark DataLoader
export const createBookmarkLoader = () => {
  return new DataLoader<{ userId: string; postId: string }, any>(async (keys) => {
    logger.debug('Bookmark DataLoader loading:', keys);
    
    const keysArray = Array.from(keys);
    const bookmarks = await prisma.bookmark.findMany({
      where: {
        OR: keysArray.map(key => ({
          userId: key.userId,
          postId: key.postId
        }))
      }
    });
    
    const bookmarkMap = new Map(
      bookmarks.map(bookmark => [
        `${bookmark.userId}-${bookmark.postId}`,
        bookmark
      ])
    );
    
    return keysArray.map(key => 
      bookmarkMap.get(`${key.userId}-${key.postId}`) || null
    );
  });
};

// Topic Subscription DataLoader
export const createTopicSubscriptionLoader = () => {
  return new DataLoader<{ userId: string; topicId: string }, any>(async (keys) => {
    logger.debug('TopicSubscription DataLoader loading:', keys);
    
    const keysArray = Array.from(keys);
    const subscriptions = await prisma.userTopic.findMany({
      where: {
        OR: keysArray.map(key => ({
          userId: key.userId,
          topicId: key.topicId
        }))
      }
    });
    
    const subscriptionMap = new Map(
      subscriptions.map(subscription => [
        `${subscription.userId}-${subscription.topicId}`,
        subscription
      ])
    );
    
    return keysArray.map(key => 
      subscriptionMap.get(`${key.userId}-${key.topicId}`) || null
    );
  });
};

// Follow DataLoader
export const createFollowLoader = () => {
  return new DataLoader<{ followerId: string; followingId: string }, any>(async (keys) => {
    logger.debug('Follow DataLoader loading:', keys);
    
    const keysArray = Array.from(keys);
    const follows = await prisma.follow.findMany({
      where: {
        OR: keysArray.map(key => ({
          followerId: key.followerId,
          followingId: key.followingId
        }))
      }
    });
    
    const followMap = new Map(
      follows.map(follow => [
        `${follow.followerId}-${follow.followingId}`,
        follow
      ])
    );
    
    return keysArray.map(key => 
      followMap.get(`${key.followerId}-${key.followingId}`) || null
    );
  });
};

// DataLoader context type
export interface DataLoaderContext {
  userLoader: DataLoader<string, any>;
  userByUsernameLoader: DataLoader<string, any>;
  postLoader: DataLoader<string, any>;
  commentLoader: DataLoader<string, any>;
  topicLoader: DataLoader<string, any>;
  topicBySlugLoader: DataLoader<string, any>;
  voteLoader: DataLoader<{ userId: string; votableId: string; votableType: 'post' | 'comment' }, any>;
  bookmarkLoader: DataLoader<{ userId: string; postId: string }, any>;
  topicSubscriptionLoader: DataLoader<{ userId: string; topicId: string }, any>;
  followLoader: DataLoader<{ followerId: string; followingId: string }, any>;
}

// Create all DataLoaders
export const createDataLoaders = (): DataLoaderContext => {
  return {
    userLoader: createUserLoader(),
    userByUsernameLoader: createUserByUsernameLoader(),
    postLoader: createPostLoader(),
    commentLoader: createCommentLoader(),
    topicLoader: createTopicLoader(),
    topicBySlugLoader: createTopicBySlugLoader(),
    voteLoader: createVoteLoader(),
    bookmarkLoader: createBookmarkLoader(),
    topicSubscriptionLoader: createTopicSubscriptionLoader(),
    followLoader: createFollowLoader()
  };
};

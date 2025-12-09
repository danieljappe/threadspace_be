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

// Post DataLoaders
export const createPostLoader = () => {
  return new DataLoader(async (postIds: readonly string[]) => {
    logger.debug('Post DataLoader loading:', postIds);
    const posts = await prisma.post.findMany({
      where: { 
        id: { in: [...postIds] },
        deletedAt: null
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
        deletedAt: null
      }
    });
    
    const commentMap = new Map(comments.map(comment => [comment.id, comment]));
    return [...commentIds].map(id => commentMap.get(id) || null);
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

// DataLoader context type
export interface DataLoaderContext {
  userLoader: DataLoader<string, any>;
  postLoader: DataLoader<string, any>;
  commentLoader: DataLoader<string, any>;
  voteLoader: DataLoader<{ userId: string; votableId: string; votableType: 'post' | 'comment' }, any>;
  bookmarkLoader: DataLoader<{ userId: string; postId: string }, any>;
}

// Create all DataLoaders
export const createDataLoaders = (): DataLoaderContext => {
  return {
    userLoader: createUserLoader(),
    postLoader: createPostLoader(),
    commentLoader: createCommentLoader(),
    voteLoader: createVoteLoader(),
    bookmarkLoader: createBookmarkLoader()
  };
};

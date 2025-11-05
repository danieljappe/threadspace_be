const { WebSocket } = require('ws');
const { createClient } = require('graphql-ws');

// Test WebSocket connection and subscriptions
async function testRealtimeFeatures() {
  console.log('🧪 Testing ThreadSpace Real-time Features...\n');

  // Test WebSocket connection
  const client = createClient({
    url: 'ws://localhost:4000/graphql',
    connectionParams: {
      // Add auth token if needed
      // authorization: 'Bearer your-jwt-token-here'
    },
  });

  // Test comment subscription
  console.log('📝 Testing comment subscription...');
  const commentSubscription = client.subscribe(
    {
      query: `
        subscription CommentAdded($postId: ID!) {
          commentAdded(postId: $postId) {
            id
            content
            author {
              username
            }
            post {
              id
              title
            }
          }
        }
      `,
      variables: { postId: 'test-post-id' }
    },
    {
      next: (data) => {
        console.log('✅ Comment added:', data);
      },
      error: (err) => {
        console.error('❌ Comment subscription error:', err);
      },
      complete: () => {
        console.log('✅ Comment subscription completed');
      },
    }
  );

  // Test post subscription
  console.log('📄 Testing post subscription...');
  const postSubscription = client.subscribe(
    {
      query: `
        subscription PostUpdated($postId: ID!) {
          postUpdated(postId: $postId) {
            id
            title
            content
            author {
              username
            }
          }
        }
      `,
      variables: { postId: 'test-post-id' }
    },
    {
      next: (data) => {
        console.log('✅ Post updated:', data);
      },
      error: (err) => {
        console.error('❌ Post subscription error:', err);
      },
      complete: () => {
        console.log('✅ Post subscription completed');
      },
    }
  );

  // Test typing subscription
  console.log('⌨️ Testing typing subscription...');
  const typingSubscription = client.subscribe(
    {
      query: `
        subscription UserTyping($postId: ID!) {
          userTyping(postId: $postId) {
            userId
            username
            postId
          }
        }
      `,
      variables: { postId: 'test-post-id' }
    },
    {
      next: (data) => {
        console.log('✅ User typing:', data);
      },
      error: (err) => {
        console.error('❌ Typing subscription error:', err);
      },
      complete: () => {
        console.log('✅ Typing subscription completed');
      },
    }
  );

  // Test notification subscription
  console.log('🔔 Testing notification subscription...');
  const notificationSubscription = client.subscribe(
    {
      query: `
        subscription NotificationReceived {
          notificationReceived {
            id
            type
            data
            isRead
            createdAt
          }
        }
      `
    },
    {
      next: (data) => {
        console.log('✅ Notification received:', data);
      },
      error: (err) => {
        console.error('❌ Notification subscription error:', err);
      },
      complete: () => {
        console.log('✅ Notification subscription completed');
      },
    }
  );

  // Keep the test running for 30 seconds
  console.log('\n⏰ Running tests for 30 seconds...');
  console.log('💡 Try creating comments, posts, or typing in another client to see real-time updates!\n');

  setTimeout(() => {
    console.log('\n🏁 Test completed! Closing subscriptions...');
    commentSubscription.unsubscribe();
    postSubscription.unsubscribe();
    typingSubscription.unsubscribe();
    notificationSubscription.unsubscribe();
    client.dispose();
    process.exit(0);
  }, 30000);
}

// Run the test
testRealtimeFeatures().catch(console.error);

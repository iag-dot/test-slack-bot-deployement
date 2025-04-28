// commands/review.js
const reviewService = require('../services/reviewService');
const { parseReviewArgs, extractUserId } = require('../utils/parsers');

// Extract client name from channel name
async function extractClientFromChannelName(channelId, slackClient) {
  try {
    const info = await slackClient.conversations.info({ channel: channelId });
    const channelName = info.channel.name;
    
    // Check if channel name starts with "client-"
    if (channelName.startsWith('client-')) {
      return channelName.substring(7); // Remove "client-" prefix
    }
    
    return channelName;
  } catch (error) {
    console.error('Error getting channel info:', error);
    return "general"; // Fallback
  }
}

// Resolve usernames to user IDs
async function resolveUserIds(userIds, slackClient) {
  const resolvedIds = [];
  
  for (const id of userIds) {
    if (id.startsWith('USERNAME:')) {
      const username = id.substring(9);
      try {
        // Try to find user by name
        const result = await slackClient.users.list();
        const user = result.members.find(member => 
          member.name === username || 
          (member.profile && member.profile.display_name === username) ||
          (member.profile && member.profile.real_name === username) ||
          (member.profile && member.profile.real_name_normalized === username.toLowerCase())
        );
        
        if (user) {
          console.log(`Found user ID ${user.id} for username ${username}`);
          resolvedIds.push(user.id);
        } else {
          console.warn(`Could not find user with name: ${username}`);
          // Don't include unresolved users to prevent API errors
        }
      } catch (error) {
        console.error(`Error looking up user ${username}:`, error);
      }
    } else {
      resolvedIds.push(id); // Already an ID
    }
  }
  
  return resolvedIds;
}

async function handleReviewCommand({ command, respond, client, logger, isDM = false }) {
  logger.info('Processing /review command:', command);
  
  try {
    // Parse the command arguments
    const args = parseReviewArgs(command.text);
    logger.debug('Parsed review arguments:', args);
    
    // Validate required fields
    if (!args.title) {
      await respond({
        text: 'Usage: /review [title] [#channel] [@reviewer1 @reviewer2...] [-url=link] [-deadline=YYYY-MM-DD] [-status=stage]',
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Extract client from channel and determine target channel
    let clientName;
    let channelId = command.channel_id;
    
    if (args.channelMention) {
      // If a specific channel was mentioned, use that
      try {
        // Handle both #channel-name and #C12345 formats
        if (args.channelMention.startsWith('#C')) {
          channelId = args.channelMention.substring(1);
        } else {
          // Extract client name from the channel mention directly
          const mentionedChannel = args.channelMention.substring(1);
          
          // If the channel starts with "client-", extract the client name
          if (mentionedChannel.startsWith('client-')) {
            clientName = mentionedChannel.substring(7); // Remove "client-" prefix
          } else {
            clientName = mentionedChannel;
          }
        }
      } catch (error) {
        logger.error('Error processing channel mention:', error);
        clientName = args.channelMention.substring(1); // Fallback to using channel name without #
      }
    } else {
      // No channel mentioned, use current channel
      try {
        clientName = await extractClientFromChannelName(channelId, client);
      } catch (error) {
        logger.error('Error getting current channel info:', error);
        clientName = "general"; // Fallback
      }
    }
    
    // Override with explicit client if provided
    if (args.client) {
      clientName = args.client;
    }
    
    // Resolve any usernames to actual user IDs
    if (args.reviewers && args.reviewers.length > 0) {
      logger.info(`Resolving user IDs for reviewers: ${args.reviewers.join(', ')}`);
      args.reviewers = await resolveUserIds(args.reviewers, client);
    }
    
    // Ensure we have at least one reviewer
    if (!args.reviewers || args.reviewers.length === 0) {
      await respond({
        text: 'Please tag at least one reviewer with @username. Make sure the username exists in this workspace.',
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Determine initial status (default to "in_review" if not specified)
    const initialStatus = args.status || "in_review";
    
    // Create the review
    const review = await reviewService.createReview(
      args.title,
      args.description || '',
      command.user_id,
      args.reviewers,
      channelId,
      clientName,
      args.url,
      args.deadline,
      initialStatus
    );
    
    // Notify the channel
    const blocks = reviewService.formatReviewRequestMessage(review);
    
    await respond({
      blocks,
      text: `Review requested for "${review.title}" from ${args.reviewers.map(r => `<@${r}>`).join(', ')}`,
      response_type: isDM ? 'in_channel' : 'in_channel'
    });
    
    // Send notifications to each reviewer
    for (const reviewerId of args.reviewers) {
      try {
        await client.chat.postMessage({
          channel: reviewerId,
          blocks: reviewService.formatReviewNotification(review),
          text: `You've been asked to review "${review.title}" for ${clientName}`
        });
        logger.info(`Review notification sent to ${reviewerId}`);
      } catch (error) {
        logger.error(`Error sending review notification to ${reviewerId}:`, error);
      }
    }
    
  } catch (error) {
    logger.error('Error in /review command:', error);
    await respond({
      text: `Error creating review request: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

module.exports = {
  handleReviewCommand
};
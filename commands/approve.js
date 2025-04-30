// commands/approve.js
const reviewService = require('../services/reviewService');

async function handleApproveCommand({ command, respond, client, logger, isDM = false }) {
  logger.info('Processing /approve command:', command);
  
  try {
    const text = command.text.trim();
    
    if (!text) {
      await respond({
        text: 'Usage: /approve [review title or ID] [optional comment]',
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Get user name for the approver
    let userName = "Unknown User";
    try {
      const userInfo = await client.users.info({ user: command.user_id });
      userName = userInfo.user.real_name || userInfo.user.name;
    } catch (error) {
      logger.error(`Error fetching user info for ${command.user_id}:`, error);
      // Continue with unknown user name
    }
    
    // Parse out client prefix (if provided)
    let clientName = null;
    let reviewTitle = text;
    let comment = "Approved";
    
    // Check if first word starts with # for client channel
    const parts = text.split(' ');
    if (parts[0].startsWith('#')) {
      const channelMention = parts[0];
      
      // Extract client name from channel
      try {
        if (channelMention.startsWith('#C')) {
          // It's a channel ID
          const channelId = channelMention.substring(1);
          const info = await client.conversations.info({ channel: channelId });
          clientName = info.channel.name;
          
          // Check for "client-" prefix
          if (clientName.startsWith('client-')) {
            clientName = clientName.substring(7);
          }
        } else {
          // It's a channel name
          clientName = channelMention.substring(1);
          
          // Check for "client-" prefix
          if (clientName.startsWith('client-')) {
            clientName = clientName.substring(7);
          }
        }
      } catch (error) {
        logger.error('Error getting channel info:', error);
        clientName = channelMention.substring(1);
      }
      
      // Remove client part from title
      reviewTitle = parts.slice(1).join(' ');
    }
    
    // Check if the last part is a comment enclosed in quotes
    if (reviewTitle.includes('"')) {
      const matches = reviewTitle.match(/^(.*?) "([^"]+)"$/);
      if (matches && matches.length >= 3) {
        reviewTitle = matches[1].trim();
        comment = matches[2];
      }
    }
    
    // Find the review by title (possibly filtered by client)
    const filters = {};
    if (clientName) {
      filters.client = clientName;
    }
    
    const reviews = await reviewService.getReviews(filters);
    let review = null;
    
    // Try to find by title match first
    for (const r of reviews) {
      // Case-insensitive partial match on title
      if (r.title.toLowerCase().includes(reviewTitle.toLowerCase())) {
        review = r;
        break;
      }
    }
    
    // If not found and it might be an ID, try that
    if (!review && reviewTitle.includes('review_')) {
      review = await reviewService.getReviewById(reviewTitle);
    }
    
    if (!review) {
      await respond({
        text: `No review found matching "${reviewTitle}"${clientName ? ` for client ${clientName}` : ''}.`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Check if user is a reviewer
    if (!review.reviewerIds.includes(command.user_id)) {
      await respond({
        text: `You are not listed as a reviewer for "${review.title}". The reviewers are: ${review.reviewerIds.map((id, index) => `<@${id}> (${review.reviewerNames[index] || 'Unknown'})`).join(', ')}`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Approve the review
    const result = await reviewService.approveReview(review.reviewId, command.user_id, userName, comment, client);
    
    if (!result.success) {
      await respond({
        text: result.message,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Send approval confirmation
    await respond({
      blocks: reviewService.formatReviewFeedbackMessage(result.review, command.user_id, userName, "approved"),
      text: `You've approved "${review.title}"`,
      response_type: 'ephemeral'
    });
    
    // Notify the client channel
    try {
      await client.chat.postMessage({
        channel: review.channel,
        blocks: reviewService.formatReviewStatusUpdate(result.review, command.user_id, userName),
        text: `<@${command.user_id}> approved "${review.title}"`
      });
      logger.info(`Approval notification sent to channel ${review.channel}`);
    } catch (error) {
      logger.error(`Error sending channel notification: ${error}`);
    }
    
    // Notify the creator if different from reviewer
    if (review.creatorId !== command.user_id) {
      try {
        await client.chat.postMessage({
          channel: review.creatorId,
          blocks: reviewService.formatReviewStatusUpdate(result.review, command.user_id, userName),
          text: `<@${command.user_id}> approved your content "${review.title}"`
        });
        logger.info(`Creator notification sent to ${review.creatorId}`);
      } catch (error) {
        logger.error(`Error sending creator notification: ${error}`);
      }
    }
    
  } catch (error) {
    logger.error('Error in /approve command:', error);
    await respond({
      text: `Error processing approval: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

module.exports = {
  handleApproveCommand
};
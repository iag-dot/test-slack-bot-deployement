// commands/status.js
const reviewService = require('../services/reviewService');

async function extractClientFromChannelMention(channelMention) {
  // Simple extraction without API calls
  // Handle #client-name format
  if (channelMention.startsWith('#client-')) {
    return channelMention.substring(8); // Remove "#client-" prefix
  } else if (channelMention.startsWith('#')) {
    return channelMention.substring(1); // Just remove "#"
  }
  
  return channelMention;
}

async function handleStatusCommand({ command, respond, client, logger, isDM = false }) {
  logger.info('Processing /client-status command:', command);
  
  try {
    const text = command.text.trim();
    let clientName = null;
    let channelId = command.channel_id;
    
    // Check if a specific channel was mentioned
    if (text && text.startsWith('#')) {
      // Extract client from the channel mention
      clientName = await extractClientFromChannelMention(text);
      
      // If channel ID was provided, use that as the target channel
      if (text.startsWith('#C')) {
        channelId = text.substring(1);
      }
    } else if (text) {
      // Treat as client name directly
      clientName = text;
    }
    
    // If no client name specified, try to extract from current channel name
    if (!clientName) {
      try {
        // Try to get channel name directly
        const info = await client.conversations.info({ channel: channelId });
        const channelName = info.channel.name;
        
        // Check if channel name starts with "client-"
        if (channelName.startsWith('client-')) {
          clientName = channelName.substring(7); // Remove "client-" prefix
        } else {
          clientName = channelName;
        }
      } catch (error) {
        logger.error('Error getting channel info:', error);
        clientName = "Unknown"; 
      }
    }
    
    logger.debug(`Getting status for client: ${clientName}, channel: ${channelId}`);
    
    // Get reviews for this client
    const filters = { client: clientName };
    const reviews = await reviewService.getReviews(filters);
    
    // Format and send the status message
    const blocks = reviewService.formatClientStatus(clientName, reviews);
    
    await respond({
      blocks,
      text: `Content status for ${clientName}`,
      response_type: isDM ? 'in_channel' : 'ephemeral'
    });
    
  } catch (error) {
    logger.error('Error in /client-status command:', error);
    await respond({
      text: `Error retrieving status: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

module.exports = {
  handleStatusCommand
};
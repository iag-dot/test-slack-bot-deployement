// commands/assign.js
const taskService = require('../services/taskService');
const { parseAssignArgs, extractUserId } = require('../utils/parsers');

async function handleAssignCommand({ command, respond, client, logger, isDM = false }) {
  logger.info('Processing /assign command:', command);
  
  try {
    // Parse the command arguments
    const args = parseAssignArgs(command.text);
    logger.debug('Parsed assign arguments:', args);
    
    if (!args.userId) {
      logger.info('Invalid format: missing user mention');
      await respond({
        text: 'Usage: /assign @username [task description] [-team=teamname] [-priority=level] [-deadline=YYYY-MM-DD] [-client=clientname]',
        response_type: 'ephemeral'
      });
      return;
    }
    
    if (!args.title) {
      logger.info('Invalid format: missing task description');
      await respond({
        text: 'Please provide a task description.',
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Get user information for assignee
    let assigneeName = "Unknown User";
    try {
      const userInfo = await client.users.info({ user: args.userId });
      assigneeName = userInfo.user.real_name || userInfo.user.name;
    } catch (error) {
      logger.error(`Error fetching user info for ${args.userId}:`, error);
      // Continue with unknown user name
    }
    
    // Get user information for creator
    let creatorName = "Unknown User";
    try {
      const creatorInfo = await client.users.info({ user: command.user_id });
      creatorName = creatorInfo.user.real_name || creatorInfo.user.name;
    } catch (error) {
      logger.error(`Error fetching user info for ${command.user_id}:`, error);
      // Continue with unknown user name
    }
    
    // Get channel name
    let channelName = null;
    try {
      const channelInfo = await client.conversations.info({ channel: command.channel_id });
      channelName = channelInfo.channel.name;
    } catch (error) {
      logger.error(`Error fetching channel info for ${command.channel_id}:`, error);
      // Continue without channel name
    }
    
    // Get user's existing tasks
    const existingTasks = await taskService.getUserPendingTasks(args.userId);
    
    // Default team based on specified team or keywords in task description
    const team = args.team || determineTeam(args.title);
    
    // Determine priority
    let priority = 'medium'; // Default priority
    if (args.priority) {
      priority = args.priority.toLowerCase();
    } else if (args.urgent) {
      priority = 'urgent';
    }
    
    // Validate priority
    if (!['urgent', 'high', 'medium', 'low'].includes(priority)) {
      priority = 'medium';
    }
    
    // Create the task
    const task = await taskService.createTask(
      team,
      priority,
      args.userId,
      assigneeName,
      args.title,
      args.description || '',
      command.user_id,
      creatorName,
      command.channel_id,
      channelName,
      args.client,
      args.urgent,
      args.deadline
    );
    
    // Generate professional response with blocks
    const blocks = taskService.formatAssignmentMessage(task, existingTasks);
    
    // Notify channel or DM
    await respond({
      blocks,
      text: `Task assigned to <@${args.userId}>`,
      response_type: isDM ? 'ephemeral' : 'ephemeral'
    });
    
    // Add a reaction to confirm the message was sent to the user
    if (!isDM) {
      try {
        await client.reactions.add({
          channel: command.channel_id,
          timestamp: command.message_ts || (await getLastMessageTs(client, command.channel_id)),
          name: 'white_check_mark'
        });
      } catch (error) {
        logger.error('Error adding reaction:', error);
        // Continue anyway - reaction is not critical
      }
    }
    
    // Send a DM to the assignee if different from the creator
    if (args.userId !== command.user_id) {
      try {
        await client.chat.postMessage({
          channel: args.userId,
          text: `You've been assigned a new task: ${task.title}`,
          blocks: taskService.formatDMNotification(task)
        });
        logger.info(`DM sent to user ${args.userId}`);
      } catch (error) {
        logger.error(`Failed to DM user ${args.userId}:`, error);
      }
    }
    
  } catch (error) {
    logger.error('Error in /assign command:', error);
    
    await respond({
      text: `Error creating task: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

// Get the last message timestamp for reaction
async function getLastMessageTs(client, channelId) {
  try {
    const result = await client.conversations.history({
      channel: channelId,
      limit: 1
    });
    
    if (result.messages && result.messages.length > 0) {
      return result.messages[0].ts;
    }
    return null;
  } catch (error) {
    console.error('Error getting last message timestamp:', error);
    return null;
  }
}

// Determine team based on keywords in task description
function determineTeam(text) {
  const lowerText = text.toLowerCase();
  
  // Teams and their associated keywords
  const teams = {
    'content': ['content', 'writing', 'blog', 'article', 'post', 'copy', 'newsletter', 'text'],
    'design': ['design', 'ui', 'ux', 'mockup', 'wireframe', 'visual', 'graphic', 'illustration'],
    'product': ['product', 'feature', 'roadmap', 'spec', 'dev', 'code', 'programming', 'functionality'],
    'ops': ['ops', 'operation', 'logistics', 'process', 'admin', 'management']
  };
  
  for (const [team, keywords] of Object.entries(teams)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return team;
    }
  }
  
  // Default to content if no team is detected
  return 'content';
}

module.exports = {
  handleAssignCommand
};
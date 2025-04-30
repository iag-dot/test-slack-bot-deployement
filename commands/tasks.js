// commands/tasks.js
const taskService = require('../services/taskService');
const { extractUserId } = require('../utils/parsers');

async function handleTasksCommand({ command, respond, client, logger, isDM = false }) {
  logger.info('Processing /tasks command:', command);
  
  try {
    const text = command.text.trim();
    const filters = {};
    
    // Default to current user's tasks if no arguments provided
    if (!text && isDM) {
      filters.assigneeId = command.user_id;
    } else if (text.includes('@')) {
      // Extract user ID from mention
      const userId = extractUserId(text);
      if (userId) {
        filters.assigneeId = userId;
      }
    } else {
      // Parse other filters
      const args = text.split(' ');
      
      for (const arg of args) {
        if (arg.includes('=')) {
          const [key, value] = arg.split('=');
          if (key && value) {
            // Handle special case for team filter which might be specified as team= or type=
            if (key === 'team' || key === 'type') {
              filters.team = value.toLowerCase();
            } else if (key === 'priority') {
              filters.priority = value.toLowerCase();
            } else if (key === 'status') {
              filters.status = value.toLowerCase();
            } else if (key === 'client') {
              filters.client = value;
            }
          }
        } else if (arg.startsWith('#')) {
          // Treat as channel name for client
          const channelName = arg.substring(1);
          filters.client = channelName;
        }
      }
    }
    
    logger.debug('Parsed task filters:', filters);
    
    const tasks = await taskService.getTasksList(filters);
    
    // Format the response based on the result
    if (tasks.length === 0) {
      await respond({
        text: filters.assigneeId 
          ? `No tasks found for <@${filters.assigneeId}>.`
          : 'No tasks found matching your filters.',
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Use the professional task list formatter
    const blocks = taskService.formatTaskList(tasks, filters);
    
    await respond({
      blocks,
      text: `Found ${tasks.length} tasks`,
      response_type: 'ephemeral'
    });
    
  } catch (error) {
    logger.error('Error in /tasks command:', error);
    await respond({
      text: `Error fetching tasks: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

module.exports = {
  handleTasksCommand
};
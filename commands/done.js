// commands/done.js
const taskService = require('../services/taskService');

async function handleDoneCommand({ command, respond, client, logger, isDM = false }) {
  logger.info('Processing /done command:', command);
  
  try {
    const text = command.text.trim();
    
    if (!text) {
      await respond({
        text: 'Usage: /done [task description]',
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Try to find the task by name/description
    const task = await taskService.getTaskByDescription(text, command.user_id);
    
    if (!task) {
      await respond({
        text: `No task found matching "${text}". Please check the task description and try again.`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Get user information for completer
    let userName = "Unknown User";
    try {
      const userInfo = await client.users.info({ user: command.user_id });
      userName = userInfo.user.real_name || userInfo.user.name;
    } catch (error) {
      logger.error(`Error fetching user info for ${command.user_id}:`, error);
      // Continue with unknown user name
    }
    
    // Mark the task as done
    const updatedTask = await taskService.markTaskAsDone(task.taskId, command.user_id, userName);
    
    if (!updatedTask) {
      await respond({
        text: `Error marking task "${text}" as complete.`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Format and send completion message
    const blocks = taskService.formatCompletionMessage(updatedTask, command.user_id);
    
    // If in DM, respond directly
    if (isDM) {
      await respond({
        blocks,
        text: `Task "${updatedTask.title}" marked as completed`,
        response_type: 'ephemeral'
      });
    } else {
      // In channel, respond with ephemeral confirmation first
      await respond({
        text: `Task "${updatedTask.title}" marked as completed.`,
        response_type: 'ephemeral'
      });
      
      // Then post a public message to the channel
      try {
        await client.chat.postMessage({
          channel: command.channel_id,
          blocks,
          text: `Task "${updatedTask.title}" has been completed by <@${command.user_id}>`
        });
      } catch (error) {
        logger.error(`Error posting completion message to channel: ${error}`);
      }
    }
    
    // If task was created in a different channel, notify that channel too
    if (updatedTask.channel !== command.channel_id) {
      try {
        await client.chat.postMessage({
          channel: updatedTask.channel,
          blocks,
          text: `Task "${updatedTask.title}" has been completed by <@${command.user_id}>`
        });
        logger.info(`Notification sent to original channel ${updatedTask.channel}`);
      } catch (error) {
        logger.error(`Error notifying original channel: ${error}`);
      }
    }
    
    // Notify task creator if different from completer
    if (updatedTask.creatorId !== command.user_id) {
      try {
        await client.chat.postMessage({
          channel: updatedTask.creatorId,
          blocks,
          text: `Task "${updatedTask.title}" assigned to <@${updatedTask.assigneeId}> has been completed.`
        });
        logger.info(`Notification sent to task creator ${updatedTask.creatorId}`);
      } catch (error) {
        logger.error(`Error notifying task creator: ${error}`);
      }
    }
    
  } catch (error) {
    logger.error('Error in /done command:', error);
    await respond({
      text: `Error marking task as done: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

module.exports = {
  handleDoneCommand
};
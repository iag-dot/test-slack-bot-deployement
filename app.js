// app.js - Main bot application
const { App } = require('@slack/bolt');
const { PrismaClient } = require('./generated/prisma');
const cron = require('node-cron');
const taskService = require('./services/taskService');
const reviewService = require('./services/reviewService');
const reportService = require('./services/reportService');
const { handleAssignCommand } = require('./commands/assign');
const { handleTasksCommand } = require('./commands/tasks');
const { handleDoneCommand } = require('./commands/done');
const { handleReviewCommand } = require('./commands/review');
const { handleApproveCommand } = require('./commands/approve');
const { handleStatusCommand } = require('./commands/status');
const { handleHelpCommand } = require('./commands/help');
const { handleDailyReportCommand } = require('./commands/dailyreport');
const { handleAiCommand } = require('./commands/ai');
const { formatHelpMessage } = require('./utils/formatters');

// Initialize Prisma with debug logging
let prisma;
try {
  prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
  console.log('Prisma client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  process.exit(1);
}

// Initialize Slack app with debug options
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
});

// Enhanced error handling middleware
app.use(async ({ logger, next }) => {
  try {
    // Call the next middleware
    await next();
  } catch (error) {
    // Log the error with detailed information
    logger.error(`Caught in middleware: ${error.message}`);
    
    // Check for permission errors specifically
    if (error.code === 'slack_webapi_platform_error' && 
        error.data && error.data.error === 'missing_scope') {
      logger.error(`Missing scopes: ${error.data.needed}`);
      logger.error(`Current scopes: ${error.data.provided}`);
      logger.error(`Please add the missing scopes in your Slack app configuration: 
        1. Go to api.slack.com/apps and find your app
        2. Navigate to OAuth & Permissions
        3. Add these scopes: ${error.data.needed}
        4. Reinstall the app to your workspace`);
    }
    
    // Let the error propagate to the global error handler
    throw error;
  }
});

// Debug listener for all incoming events
app.use(async ({ logger, body, next }) => {
  logger.debug('Incoming event:', JSON.stringify(body, null, 2));
  await next();
});

// Initialize services with prisma client
taskService.init(prisma);
reviewService.init(prisma);
reportService.init(prisma);

// Register slash commands
app.command('/assign', async ({ command, ack, respond, client, logger }) => {
  await ack();
  try {
    await handleAssignCommand({ command, respond, client, logger });
  } catch (error) {
    logger.error(`Error in assign command: ${error.message}`);
    await respond({
      text: `Error creating task: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

app.command('/tasks', async ({ command, ack, respond, client, logger }) => {
  await ack();
  try {
    await handleTasksCommand({ command, respond, client, logger });
  } catch (error) {
    logger.error(`Error in tasks command: ${error.message}`);
    await respond({
      text: `Error fetching tasks: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

app.command('/done', async ({ command, ack, respond, client, logger }) => {
  await ack();
  try {
    await handleDoneCommand({ command, respond, client, logger });
  } catch (error) {
    logger.error(`Error in done command: ${error.message}`);
    await respond({
      text: `Error marking task as done: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

app.command('/review', async ({ command, ack, respond, client, logger }) => {
  await ack();
  try {
    await handleReviewCommand({ command, respond, client, logger });
  } catch (error) {
    logger.error(`Error in review command: ${error.message}`);
    await respond({
      text: `Sorry, I encountered an error while processing your review request. Please make sure I have the necessary permissions.`,
      response_type: 'ephemeral'
    });
  }
});

app.command('/approve', async ({ command, ack, respond, client, logger }) => {
  await ack();
  try {
    await handleApproveCommand({ command, respond, client, logger });
  } catch (error) {
    logger.error(`Error in approve command: ${error.message}`);
    await respond({
      text: `Error processing approval: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

app.command('/client-status', async ({ command, ack, respond, client, logger }) => {
  await ack();
  try {
    await handleStatusCommand({ command, respond, client, logger });
  } catch (error) {
    logger.error(`Error in client-status command: ${error.message}`);
    await respond({
      text: `Sorry, I encountered an error while processing your status request. Please make sure I have the necessary permissions.`,
      response_type: 'ephemeral'
    });
  }
});

app.command('/dailyreport', async ({ command, ack, respond, client, logger }) => {
  await ack();
  try {
    await handleDailyReportCommand({ command, respond, client, logger });
  } catch (error) {
    logger.error(`Error in dailyreport command: ${error.message}`);
    await respond({
      text: `Sorry, I encountered an error generating the report: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

app.command('/inagiffyhelp', async ({ command, ack, respond, logger }) => {
  await ack();
  try {
    await handleHelpCommand({ command, respond, logger });
  } catch (error) {
    logger.error(`Error in help command: ${error.message}`);
    await respond({
      text: `Error displaying help: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

// New AI command
app.command('/ai', async ({ command, ack, respond, client, logger }) => {
  await ack();
  try {
    await handleAiCommand({ command, respond, client, logger });
  } catch (error) {
    logger.error(`Error in AI command: ${error.message}`);
    await respond({
      text: `Error processing your request: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

// Add button action handlers

// Task completion button
app.action('complete_task', async ({ body, ack, respond, client, logger }) => {
  await ack();
  const taskId = body.actions[0].value;
  const userId = body.user.id;
  
  try {
    // Get user's name
    let userName = "Unknown User";
    try {
      const userInfo = await client.users.info({ user: userId });
      userName = userInfo.user.real_name || userInfo.user.name;
    } catch (error) {
      logger.error(`Error fetching user info for ${userId}:`, error);
      // Continue with unknown user name
    }
    
    const task = await taskService.markTaskAsDone(taskId, userId, userName);
    
    if (!task) {
      await respond({
        text: "Couldn't find that task. It might have been completed already.",
        replace_original: false,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Update the original message
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: taskService.formatCompletionMessage(task, userId),
      text: `Task "${task.title}" marked as completed`,
    });
    
    // Notify the task creator channel
    try {
      // Ensure bot is in the channel
      await reviewService.ensureBotInChannel(task.channel, client);
      
      await client.chat.postMessage({
        channel: task.channel,
        blocks: taskService.formatCompletionMessage(task, userId),
        text: `Task "${task.title}" has been completed by <@${userId}>`
      });
    } catch (error) {
      logger.error(`Failed to notify channel about completion: ${error}`);
    }
    
  } catch (error) {
    logger.error('Error handling complete_task button:', error);
    await respond({
      text: `Error marking task as done: ${error.message}`,
      replace_original: false,
      response_type: 'ephemeral'
    });
  }
});

// Review approval button
app.action('approve_review', async ({ body, ack, respond, client, logger }) => {
  await ack();
  const reviewId = body.actions[0].value;
  const userId = body.user.id;
  
  try {
    // Get user's name
    let userName = "Unknown User";
    try {
      const userInfo = await client.users.info({ user: userId });
      userName = userInfo.user.real_name || userInfo.user.name;
    } catch (error) {
      logger.error(`Error fetching user info for ${userId}:`, error);
      // Continue with unknown user name
    }
    
    // Pass simple string as comment, not the client object (fixed)
    const result = await reviewService.approveReview(reviewId, userId, userName, "Approved", null);
    
    if (!result.success) {
      await respond({
        text: result.message,
        replace_original: false,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Update the original message
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      blocks: reviewService.formatReviewFeedbackMessage(result.review, userId, userName, "approved"),
      text: `Feedback provided for "${result.review.title}"`
    });
    
    // Send notifications separately
    try {
      // Notify the channel
      await client.chat.postMessage({
        channel: result.review.channel,
        blocks: reviewService.formatReviewStatusUpdate(result.review, userId, userName),
        text: `<@${userId}> approved "${result.review.title}"`
      });
      
      // Notify the creator if different from reviewer
      if (result.review.creatorId !== userId) {
        await client.chat.postMessage({
          channel: result.review.creatorId,
          blocks: reviewService.formatReviewStatusUpdate(result.review, userId, userName),
          text: `<@${userId}> approved your content "${result.review.title}"`
        });
      }
    } catch (notificationError) {
      logger.error(`Error sending notifications: ${notificationError}`);
    }
    
  } catch (error) {
    logger.error('Error handling review approval:', error);
    await respond({
      text: `Error approving review: ${error.message}`,
      replace_original: false,
      response_type: 'ephemeral'
    });
  }
});

// Review request changes button
app.action('request_changes', async ({ body, ack, client, logger }) => {
  await ack();
  
  try {
    // Open a modal to collect feedback
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "review_feedback_modal",
        private_metadata: JSON.stringify({
          reviewId: body.actions[0].value,
          channelId: body.channel.id,
          messageTs: body.message.ts
        }),
        title: {
          type: "plain_text",
          text: "Provide Feedback",
          emoji: true
        },
        submit: {
          type: "plain_text",
          text: "Submit",
          emoji: true
        },
        close: {
          type: "plain_text",
          text: "Cancel",
          emoji: true
        },
        blocks: [
          {
            type: "input",
            block_id: "feedback_input",
            element: {
              type: "plain_text_input",
              action_id: "feedback",
              multiline: true,
              placeholder: {
                type: "plain_text",
                text: "Please provide your feedback and requested changes..."
              }
            },
            label: {
              type: "plain_text",
              text: "Feedback",
              emoji: true
            }
          }
        ]
      }
    });
  } catch (error) {
    logger.error('Error opening feedback modal:', error);
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: `Error opening feedback form: ${error.message}`
    });
  }
});

// Handle feedback modal submission
app.view('review_feedback_modal', async ({ ack, body, view, client, logger }) => {
  await ack();
  
  try {
    const { reviewId, channelId, messageTs } = JSON.parse(view.private_metadata);
    const feedback = view.state.values.feedback_input.feedback.value;
    const userId = body.user.id;
    
    // Get user's name
    let userName = "Unknown User";
    try {
      const userInfo = await client.users.info({ user: userId });
      userName = userInfo.user.real_name || userInfo.user.name;
    } catch (error) {
      logger.error(`Error fetching user info for ${userId}:`, error);
      // Continue with unknown user name
    }
    
    const result = await reviewService.addFeedback(reviewId, userId, userName, feedback, "requested_changes", client);
    
    if (!result.success) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: result.message
      });
      return;
    }
    
    // Update the original message
    await client.chat.update({
      channel: channelId,
      ts: messageTs,
      blocks: reviewService.formatReviewFeedbackMessage(result.review, userId, userName, "requested_changes"),
      text: `Feedback provided for "${result.review.title}"`
    });
    
    // Notify the review creator and channel
    try {
      // Ensure bot is in the channel
      await reviewService.ensureBotInChannel(result.review.channel, client);
      
      await client.chat.postMessage({
        channel: result.review.channel,
        blocks: reviewService.formatReviewFeedbackNotification(result.review, userId, userName, feedback),
        text: `<@${userId}> requested changes for "${result.review.title}"`
      });
    } catch (error) {
      logger.error(`Error sending channel notification: ${error}`);
    }
    
  } catch (error) {
    logger.error('Error processing feedback submission:', error);
    await client.chat.postEphemeral({
      channel: body.channel.id,
      user: body.user.id,
      text: `Error submitting feedback: ${error.message}`
    });
  }
});

// Handle app_mention events with professional responses
app.event('app_mention', async ({ event, say, logger }) => {
  logger.info('Bot was mentioned:', event);
  
  const responses = [
    `Hello <@${event.user}>. I'm the Inagiffy Bot, here to help with task management and content reviews. Try /assign, /tasks, /done, /review, /client-status, or /ai commands.`,
    `Hi <@${event.user}>. Need help managing your workflow? Use /inagiffyhelp to see all available commands or try /ai for natural language requests.`,
    `<@${event.user}>, I can help you manage tasks and content reviews. Type /inagiffyhelp to view the command guide or use /ai to ask me something in natural language.`
  ];
  
  const randomResponse = responses[Math.floor(Math.random() * responses.length)];
  
  await say({
    text: randomResponse,
    thread_ts: event.ts
  });
});

// Handle direct messages
app.event('message', async ({ message, say, client, logger }) => {
  // Only respond to direct messages that are not from bots and are not message_changed events
  if (message.channel_type === 'im' && !message.bot_id && !message.subtype) {
    logger.info('Received DM:', message);
    
    // Process commands in DMs by prefixing with the slash command name
    const text = message.text ? message.text.trim() : '';
    
    if (text.startsWith('assign ')) {
      await handleAssignCommand({ 
        command: { 
          text: text.substring('assign '.length),
          user_id: message.user,
          channel_id: message.channel 
        }, 
        respond: say, 
        client, 
        logger,
        isDM: true 
      });
    } else if (text.startsWith('tasks ') || text === 'tasks') {
      await handleTasksCommand({ 
        command: { 
          text: text === 'tasks' ? '' : text.substring('tasks '.length),
          user_id: message.user,
          channel_id: message.channel 
        }, 
        respond: say, 
        client, 
        logger,
        isDM: true 
      });
    } else if (text.startsWith('done ') || text === 'done') {
      await handleDoneCommand({ 
        command: { 
          text: text === 'done' ? '' : text.substring('done '.length),
          user_id: message.user,
          channel_id: message.channel 
        }, 
        respond: say, 
        client, 
        logger,
        isDM: true 
      });
    } else if (text.startsWith('review ')) {
      await handleReviewCommand({ 
        command: { 
          text: text.substring('review '.length),
          user_id: message.user,
          channel_id: message.channel 
        }, 
        respond: say, 
        client, 
        logger,
        isDM: true 
      });
    } else if (text.startsWith('approve ')) {
      await handleApproveCommand({ 
        command: { 
          text: text.substring('approve '.length),
          user_id: message.user,
          channel_id: message.channel 
        }, 
        respond: say, 
        client, 
        logger,
        isDM: true 
      });
    } else if (text.startsWith('status ') || text === 'status') {
      await handleStatusCommand({ 
        command: { 
          text: text === 'status' ? '' : text.substring('status '.length),
          user_id: message.user,
          channel_id: message.channel 
        }, 
        respond: say, 
        client, 
        logger,
        isDM: true 
      });
    } else if (text.startsWith('dailyreport ') || text === 'dailyreport') {
      await handleDailyReportCommand({ 
        command: { 
          text: text === 'dailyreport' ? '' : text.substring('dailyreport '.length),
          user_id: message.user,
          channel_id: message.channel 
        }, 
        respond: say, 
        client, 
        logger,
        isDM: true 
      });
    } else if (text.startsWith('ai ')) {
      // Handle AI command in DMs
      await handleAiCommand({ 
        command: { 
          text: text.substring('ai '.length),
          user_id: message.user,
          channel_id: message.channel 
        }, 
        respond: say, 
        client, 
        logger,
        isDM: true 
      });
    } else if (text === 'help') {
      await handleHelpCommand({ 
        command: { 
          user_id: message.user,
          channel_id: message.channel 
        }, 
        respond: say, 
        logger,
        isDM: true 
      });
    } else {
      // Send help message for unrecognized commands
      await say({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Hello <@${message.user}>! I'm the Inagiffy Bot. You can use these commands in our conversation:`
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "• `assign @username [task description] [options]` - Create a new task\n• `tasks [@username or team=teamname]` - View tasks\n• `done [task description]` - Mark a task as complete\n• `review [title] [options]` - Request a review\n• `approve [title]` - Approve a review\n• `status [#channel]` - Check content status\n• `dailyreport [team=teamname]` - Get daily activity report\n• `ai [your question or request]` - Use AI to help with tasks and questions\n• `help` - Show this guide"
            }
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "You can also use slash commands in channels: /assign, /tasks, /done, /review, /approve, /client-status, /dailyreport, /ai"
              }
            ]
          }
        ],
        text: "Inagiffy Bot Help Guide"
      });
    }
  }
});

// Schedule task reminder job to run every hour
cron.schedule('0 * * * *', async () => {
  console.log('Running task reminder check');
  await taskService.sendTaskReminders(app.client);
});

// Schedule end of day report job
cron.schedule('0 17 * * 1-5', async () => {
  console.log('Generating end of day report');
  await reportService.generateDailyReport(app.client);
});

// Error handler
app.error((error) => {
  console.error('Global error handler caught:', error);
});

// Start the app
(async () => {
  try {
    await app.start(process.env.PORT || 3000);
    console.log('Inagiffy Bot is running');
    console.log(`Bot runs in Socket Mode: ${app.socketMode}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('Required scopes: app_mentions:read, chat:write, chat:write.public, commands, im:write, users:read, im:history, channels:join, channels:read, groups:read, mpim:read, im:read, reactions:write');
  } catch (error) {
    console.error('Failed to start app:', error);
    process.exit(1);
  }
})();
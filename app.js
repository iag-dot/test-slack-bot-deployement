// app.js - Main bot application
const { App } = require('@slack/bolt');
const { PrismaClient } = require('./generated/prisma');
const cron = require('node-cron');

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

// Initialize Slack app with more debug options
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: 'debug'
});

// Teams and their associated stages
const TEAMS = {
  'content': ['content', 'writing', 'blog', 'article', 'post'],
  'product': ['product', 'feature', 'roadmap', 'spec', 'dev'],
  'design': ['design', 'ui', 'ux', 'mockup', 'wireframe'],
  'ops': ['ops', 'operation', 'logistics', 'process']
};

// Debug listener for all incoming events
app.use(async ({ logger, body, next }) => {
  logger.debug('Incoming event:', JSON.stringify(body, null, 2));
  await next();
});

// Task Management Functions
async function createTask(stage, priority, assignee, taskDescription, channel, isUrgent = false, deadline = null) {
  console.log(`Creating task: stage=${stage}, priority=${priority}, assignee=${assignee}, isUrgent=${isUrgent}, custom deadline=${deadline}`);
  
  // Calculate deadline based on priority if not provided
  let taskDeadline;
  if (deadline) {
    // Use the provided deadline
    taskDeadline = new Date(deadline);
  } else {
    // Calculate based on priority
    const deadlineMap = {
      'high': 1,
      'medium': 2,
      'low': 3
    };
    
    // If urgent flag is set, always use high priority
    const actualPriority = isUrgent ? 'high' : priority;
    
    taskDeadline = new Date();
    taskDeadline.setDate(taskDeadline.getDate() + deadlineMap[actualPriority]);
  }
  
  try {
    // Create task in database
    const task = await prisma.task.create({
      data: {
        stage,
        priority: isUrgent ? 'high' : priority,
        assignee,
        task: taskDescription,
        channel,
        createdAt: new Date(),
        deadline: taskDeadline,
        status: 'pending',
        taskId: Date.now().toString(),
        reminderSent: false
      }
    });
    
    console.log('Task created successfully:', task);
    return task;
  } catch (error) {
    console.error('Error creating task in database:', error);
    throw error;
  }
}

async function getUserPendingTasks(assignee) {
  console.log(`Getting pending tasks for user: ${assignee}`);
  try {
    const tasks = await prisma.task.findMany({
      where: {
        assignee,
        status: 'pending'
      },
      orderBy: {
        deadline: 'asc' // Order by earliest deadline first
      }
    });
    console.log(`Found ${tasks.length} pending tasks for user ${assignee}`);
    return tasks;
  } catch (error) {
    console.error(`Error fetching tasks for user ${assignee}:`, error);
    return [];
  }
}

async function getTaskByName(taskName, assignee = null) {
  console.log(`Looking for task with name: ${taskName}, assignee: ${assignee || 'any'}`);
  
  const where = {
    task: {
      contains: taskName,
      mode: 'insensitive'
    }
  };
  
  if (assignee) {
    where.assignee = assignee;
  }
  
  try {
    const tasks = await prisma.task.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      take: 1
    });
    
    return tasks.length > 0 ? tasks[0] : null;
  } catch (error) {
    console.error(`Error finding task by name: ${error}`);
    return null;
  }
}

async function getTasksList(filters = {}) {
  console.log('Getting tasks list with filters:', filters);
  const where = {};
  
  // Apply filters if provided
  if (filters.stage) {
    where.stage = filters.stage;
  }
  if (filters.priority) {
    where.priority = filters.priority;
  }
  if (filters.assignee) {
    where.assignee = filters.assignee;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  
  try {
    const tasks = await prisma.task.findMany({
      where,
      orderBy: [
        { priority: 'asc' },
        { deadline: 'asc' }
      ]
    });
    console.log(`Found ${tasks.length} tasks matching filters`);
    return tasks;
  } catch (error) {
    console.error('Error fetching tasks list:', error);
    return [];
  }
}

async function markTaskAsDone(taskId) {
  console.log(`Marking task as done: ${taskId}`);
  try {
    const task = await prisma.task.update({
      where: {
        taskId
      },
      data: {
        status: 'completed',
        completedAt: new Date()
      }
    });
    
    console.log('Task marked as completed:', task);
    return task;
  } catch (error) {
    console.error(`Error marking task ${taskId} as done:`, error);
    return null;
  }
}

// Format task details for display with professional styling
function formatTaskForDisplay(task) {
  const formattedDeadline = `${task.deadline.toLocaleDateString()} ${task.deadline.toLocaleTimeString()}`;
  
  const priorityIcons = {
    'high': '•',
    'medium': '•',
    'low': '•'
  };
  
  const stageLabels = {
    'content': 'Content',
    'design': 'Design',
    'product': 'Product',
    'ops': 'Operations',
    'qc': 'Quality Control'
  };
  
  const stageName = stageLabels[task.stage] || task.stage.charAt(0).toUpperCase() + task.stage.slice(1);
  const statusDisplay = task.status === 'pending' ? 'In Progress' : 'Completed';
  
  return `*${task.task}*\n` +
         `*Priority:* ${task.priority}\n` +
         `*Team:* ${stageName}\n` +
         `*Assigned to:* <@${task.assignee}>\n` +
         `*Due:* ${formattedDeadline}\n` +
         `*Task ID:* ${task.taskId}\n` +
         `*Status:* ${statusDisplay}`;
}

// Helper to format user's existing tasks for display
function formatExistingTasksList(tasks) {
  if (tasks.length === 0) {
    return "No current tasks assigned.";
  }
  
  const taskLines = tasks.map(task => {
    const dueDate = task.deadline.toLocaleDateString();
    const dueTime = task.deadline.toLocaleTimeString();
    return `• "${task.task}" - ${task.priority} priority - due ${dueDate} ${dueTime}`;
  });
  
  return taskLines.join('\n');
}

// Format assignment notification with professional styling
function formatAssignmentMessage(task, existingTasks = []) {
  const hasExistingTasks = existingTasks.length > 0;
  
  let blocks = [];
  
  // Header section
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: "New Task Assignment",
      emoji: false
    }
  });
  
  // Task details section
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: formatTaskForDisplay(task)
    }
  });
  
  // Existing tasks section (if any)
  if (hasExistingTasks) {
    blocks.push({
      type: "divider"
    });
    
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Current Tasks for <@${task.assignee}>:*\n${formatExistingTasksList(existingTasks)}`
      }
    });
  }
  
  // Action hints
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Use \`/markdone ${task.taskId}\` or \`/markdone ${task.task}\` to mark as complete`
      }
    ]
  });
  
  return blocks;
}

// Format DM notification
function formatDMNotification(task) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "New Task Assignment",
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: formatTaskForDisplay(task)
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `This task was assigned from <#${task.channel}>`
        }
      ]
    }
  ];
  
  return blocks;
}

// Format completion notification
function formatCompletionMessage(task, completedByUserId) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Task Completed",
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: formatTaskForDisplay(task)
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Completed by <@${completedByUserId}> on ${new Date().toLocaleDateString()}`
        }
      ]
    }
  ];
  
  return blocks;
}

// Format task list
function formatTaskList(tasks, filters = {}) {
  const blocks = [];
  
  // Header
  let headerText = "Task List";
  if (filters.assignee) {
    headerText = `Tasks for <@${filters.assignee}>`;
  } else if (Object.keys(filters).length > 0) {
    headerText = "Filtered Tasks";
  }
  
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: headerText.replace(/<@[^>]+>/g, ''),
      emoji: false
    }
  });

  // Summary
  let summaryText = `Found ${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  if (tasks.length === 0) {
    summaryText = "No tasks found matching your criteria.";
  }
  
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: summaryText
    }
  });
  
  // Applied filters (if any)
  if (Object.keys(filters).length > 0) {
    const filterDescriptions = [];
    if (filters.stage) filterDescriptions.push(`Team: ${filters.stage}`);
    if (filters.priority) filterDescriptions.push(`Priority: ${filters.priority}`);
    if (filters.assignee) filterDescriptions.push(`Assignee: <@${filters.assignee}>`);
    if (filters.status) filterDescriptions.push(`Status: ${filters.status}`);
    
    if (filterDescriptions.length > 0) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Filters: ${filterDescriptions.join(' | ')}`
          }
        ]
      });
    }
  }
  
  blocks.push({
    type: "divider"
  });
  
  // Tasks
  tasks.forEach(task => {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: formatTaskForDisplay(task)
      }
    });
  });
  
  // Help context
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "Need help? Type `/taskhelp` for command information."
      }
    ]
  });
  
  return blocks;
}

// Format reminder notification
function formatReminderMessage(task) {
  const dueIn = Math.floor((task.deadline - new Date()) / (1000 * 60 * 60));
  
  const dueText = dueIn <= 1 
    ? "Due in less than an hour." 
    : `Due in approximately ${dueIn} hours.`;
  
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Task Reminder",
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${dueText}*\n\n${formatTaskForDisplay(task)}`
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Mark Complete",
            emoji: false
          },
          value: task.taskId,
          action_id: "complete_task"
        }
      ]
    }
  ];
  
  return blocks;
}

// Format help message
function formatHelpMessage() {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Task Management Help",
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Command Reference*"
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*`/assign @username task description [options]`*\nAssign a new task to a team member\n\n*Options:*\n• `-urgent` - High priority with 1-day deadline\n• `-team=teamname` - Specify team (content, product, design, ops)\n• `-deadline=YYYY-MM-DD` - Set custom due date"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*`/tasks [filters]`*\nView task list with optional filters\n\n*Examples:*\n• `/tasks` - View all tasks\n• `/tasks @username` - View a specific user's tasks\n• `/tasks stage=design priority=high` - Filter by criteria"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*`/markdone [taskId or task name]`*\nMark a task as complete\n\n*Examples:*\n• `/markdone 1682514937123` - Using task ID\n• `/markdone newsletter draft` - Using task name"
      }
    },
    {
      type: "divider"
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Inagiffy Task Management | Optimizing your workflow"
        }
      ]
    }
  ];
}

// Extract user ID from different mention formats
function extractUserId(text) {
  // Different patterns:
  // <@U12345|username> - Slack's normal mention format
  // <@U12345> - Slack's userID-only mention format
  // @U12345 - Manual format some users might use
  // @username - Just a username with @ prefix
  // @<@U12345|username> - Double @ format from slash command

  // Remove double @ if present (from slash command)
  const cleanedText = text.replace(/@@/g, '@');
  
  // Try to match Slack's mention format
  const mentionPattern = /<@([A-Z0-9]+)(?:\|[^>]+)?>/;
  const mentionMatch = cleanedText.match(mentionPattern);
  
  if (mentionMatch) {
    return mentionMatch[1]; // Return just the user ID
  }
  
  // Try a raw ID format like @U12345
  if (cleanedText.startsWith('@U') && cleanedText.substring(1).match(/^[A-Z0-9]+$/)) {
    return cleanedText.substring(1);
  }
  
  // If it's just a username or something else, return as is
  if (cleanedText.startsWith('@')) {
    return cleanedText.substring(1);
  }
  
  return cleanedText;
}

// Determine stage based on keywords in task description or specified team
function determineStage(text, specifiedTeam = null) {
  // If a team is explicitly specified, use that
  if (specifiedTeam && TEAMS[specifiedTeam.toLowerCase()]) {
    return specifiedTeam.toLowerCase();
  }
  
  // Otherwise, try to detect from keywords in the task description
  const lowerText = text.toLowerCase();
  
  for (const [team, keywords] of Object.entries(TEAMS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return team;
    }
  }
  
  // Default to content if no team is detected
  return 'content';
}

// Parse arguments from command text
function parseCommandArgs(text) {
  const result = {
    userId: null,
    taskDescription: '',
    isUrgent: false,
    team: null,
    deadline: null
  };
  
  // Split by spaces but preserve quoted text
  const matches = text.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  
  // Process arguments
  for (let i = 0; i < matches.length; i++) {
    const arg = matches[i].replace(/"/g, ''); // Remove quotes
    
    if (i === 0 && arg.includes('@')) {
      // First argument is the user mention
      result.userId = extractUserId(arg);
    } else if (arg === '-urgent') {
      result.isUrgent = true;
    } else if (arg.startsWith('-team=')) {
      result.team = arg.substring(6).toLowerCase();
    } else if (arg.startsWith('-deadline=')) {
      result.deadline = arg.substring(10);
    } else if (result.userId) {
      // If we've already found the user ID, add this to the task description
      if (result.taskDescription.length > 0) {
        result.taskDescription += ' ';
      }
      result.taskDescription += arg;
    }
  }
  
  return result;
}

// Process message text commands (for direct messaging with the bot)
function processMessageCommand(text) {
  text = text.trim();
  
  // Check if text starts with any of our recognized commands
  if (text.startsWith('assign')) {
    return {
      command: 'assign',
      text: text.substring('assign'.length).trim()
    };
  } else if (text.startsWith('tasks')) {
    return {
      command: 'tasks',
      text: text.substring('tasks'.length).trim()
    };
  } else if (text.startsWith('markdone')) {
    return {
      command: 'markdone',
      text: text.substring('markdone'.length).trim()
    };
  } else if (text.startsWith('help')) {
    return {
      command: 'help',
      text: ''
    };
  }
  
  return null;
}

// Slack Commands
app.command('/assign', async ({ command, ack, respond, logger }) => {
  logger.info('Received /assign command:', command);
  
  try {
    // First, acknowledge the command
    await ack();
    
    // Parse the command arguments
    const args = parseCommandArgs(command.text);
    logger.debug('Parsed arguments:', args);
    
    if (!args.userId) {
      logger.info('Invalid format: missing user mention');
      await respond({
        text: 'Usage: /assign @username task description [-urgent] [-team=teamname] [-deadline=YYYY-MM-DD]',
        response_type: 'ephemeral'
      });
      return;
    }
    
    if (!args.taskDescription) {
      logger.info('Invalid format: missing task description');
      await respond({
        text: 'Please provide a task description.',
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Get user's existing tasks
    const existingTasks = await getUserPendingTasks(args.userId);
    
    // Determine stage based on task or specified team
    const stage = determineStage(args.taskDescription, args.team);
    
    // Default priority (urgent tasks are always high priority)
    const priority = args.isUrgent ? 'high' : 'low';
    
    // Create the task
    const task = await createTask(
      stage, 
      priority, 
      args.userId, 
      args.taskDescription, 
      command.channel_id, 
      args.isUrgent,
      args.deadline
    );
    
    // Generate professional response with blocks
    const blocks = formatAssignmentMessage(task, existingTasks);
    
    // Notify channel
    await respond({
      blocks,
      text: `Task assigned to <@${args.userId}>`,
      response_type: 'in_channel'
    });
    
    // Send an enhanced DM to the assignee
    try {
      await app.client.chat.postMessage({
        channel: args.userId,
        text: `You've been assigned a new task: ${task.task}`,
        blocks: formatDMNotification(task)
      });
      logger.info(`DM sent to user ${args.userId}`);
    } catch (error) {
      logger.error(`Failed to DM user ${args.userId}:`, error);
    }
    
  } catch (error) {
    logger.error('Error in /assign command:', error);
    
    try {
      await respond({
        text: `Error creating task: ${error.message}`,
        response_type: 'ephemeral'
      });
    } catch (respondError) {
      logger.error('Error sending error response:', respondError);
    }
  }
});

app.command('/tasks', async ({ command, ack, respond, logger }) => {
  logger.info('Received /tasks command:', command);
  
  try {
    await ack();
    
    const text = command.text.trim();
    const filters = {};
    
    // Check if the user is looking for someone's tasks
    if (text.includes('@')) {
      const userId = extractUserId(text);
      if (userId) {
        filters.assignee = userId;
      }
    } else {
      // Parse other filters
      const args = text.split(' ');
      
      args.forEach(arg => {
        const [key, value] = arg.split('=');
        if (key && value) {
          filters[key] = value;
        }
      });
    }
    
    logger.debug('Parsed filters:', filters);
    
    const tasks = await getTasksList(filters);
    
    if (tasks.length === 0) {
      await respond({
        text: filters.assignee 
          ? `No tasks found for <@${filters.assignee}>.`
          : 'No tasks found matching your filters.',
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Use the professional task list formatter
    const blocks = formatTaskList(tasks, filters);
    
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
});

async function ensureBotInChannel(channelId, client) {
  try {
    // Attempt to join the channel
    await client.conversations.join({
      channel: channelId
    });
    console.log(`Joined channel ${channelId}`);
    return true;
  } catch (error) {
    console.error(`Failed to join channel ${channelId}:`, error);
    return false;
  }
}

app.command('/markdone', async ({ command, ack, respond, logger }) => {
  logger.info('Received /markdone command:', command);
  
  try {
    await ack();
    
    const text = command.text.trim();
    
    if (!text) {
      await respond({
        text: 'Usage: /markdone [taskId or task name]',
        response_type: 'ephemeral'
      });
      return;
    }
    
    let task;
    
    // Check if text is a task ID (numeric)
    if (/^\d+$/.test(text)) {
      task = await markTaskAsDone(text);
    } else {
      // Otherwise, treat it as a task name and find the task by name
      const foundTask = await getTaskByName(text, command.user_id);
      
      if (foundTask) {
        task = await markTaskAsDone(foundTask.taskId);
      } else {
        await respond({
          text: `No task found with name containing "${text}". Please check the task name and try again.`,
          response_type: 'ephemeral'
        });
        return;
      }
    }
    
    if (!task) {
      await respond({
        text: `Task with ID/name "${text}" not found or you don't have permission to mark it as done.`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Use the professional completion formatter
    const blocks = formatCompletionMessage(task, command.user_id);
    
    await respond({
      blocks,
      text: `Task ${task.task} marked as completed`,
      response_type: 'ephemeral'
    });
    
    // Try to post directly to the channel without joining first
    try {
      await app.client.chat.postMessage({
        channel: task.channel,
        text: `Task "${task.task}" has been completed by <@${command.user_id}>`,
        blocks: formatCompletionMessage(task, command.user_id)
      });
      logger.info(`Channel ${task.channel} notified of task completion`);
    } catch (error) {
      // If posting fails, log the error but don't worry too much
      // The user still sees the completion message in their own view
      logger.warn(`Note: Could not post completion message to channel. The bot might need to be invited to the channel or granted additional permissions.`);
      logger.error(`Detail: ${error.message}`);
    }
    
  } catch (error) {
    logger.error('Error in /markdone command:', error);
    await respond({
      text: `Error marking task as done: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
});

// Command to show help information with enhanced formatting
app.command('/taskhelp', async ({ command, ack, respond }) => {
  await ack();
  
  // Use the professional help formatter
  const blocks = formatHelpMessage();

  await respond({
    blocks,
    text: "Task Management Help"
  });
});

// Add button action handler for "Mark Complete" button in reminders
app.action('complete_task', async ({ body, ack, respond, client, logger }) => {
  await ack();
  
  const taskId = body.actions[0].value;
  const userId = body.user.id;
  
  try {
    const task = await markTaskAsDone(taskId);
    
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
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Task Completed",
            emoji: false
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: formatTaskForDisplay(task)
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Completed by <@${userId}> just now.`
            }
          ]
        }
      ],
      text: `Task ${task.task} marked as completed`,
      response_type: 'in_channel'

    });
    
    // Notify the task creator
    try {
      // Ensure bot is in the channel first
      await ensureBotInChannel(task.channel, client);
      
      // Then post the message
      await client.chat.postMessage({
        channel: task.channel,
        blocks: formatCompletionMessage(task, userId),
        text: `Task "${task.task}" has been completed by <@${userId}>`
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

// Set up reminders
async function sendReminders() {
  console.log('Running scheduled reminder check');
  try {
    const now = new Date();
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(now.getDate() + 1);
    
    console.log(`Checking for tasks due between ${now.toISOString()} and ${oneDayFromNow.toISOString()}`);
    
    // Get tasks with deadlines within the next 24 hours
    const tasks = await prisma.task.findMany({
      where: {
        status: 'pending',
        deadline: {
          lte: oneDayFromNow,
          gt: now
        },
        reminderSent: false
      }
    });
    
    console.log(`Found ${tasks.length} tasks that need reminders`);
    
    for (const task of tasks) {
      try {
        // Send reminder to assignee with professional formatting
        await app.client.chat.postMessage({
          channel: task.assignee,
          text: `Reminder: You have a task due soon: ${task.task}`,
          blocks: formatReminderMessage(task)
        });
        
        console.log(`Sent reminder for task ${task.taskId} to user ${task.assignee}`);
        
        // Mark reminder as sent
        await prisma.task.update({
          where: { id: task.id },
          data: { reminderSent: true }
        });
        
      } catch (error) {
        console.error(`Failed to send reminder for task ${task.taskId}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error in reminder job:`, error);
  }
}

// Handle app_mention events with professional responses
app.event('app_mention', async ({ event, say, logger }) => {
  logger.info('Bot was mentioned:', event);
  
  const responses = [
    `Hello <@${event.user}>. I'm here to assist with task management. Try /assign, /tasks, or /markdone.`,
    `Hi <@${event.user}>. Need help with task management? Use /taskhelp to see available commands.`,
    `<@${event.user}>, I can help you manage your tasks. Type /taskhelp to view the command guide.`
  ];
  
  const randomResponse = responses[Math.floor(Math.random() * responses.length)];
  
  await say({
    text: randomResponse,
    thread_ts: event.ts
  });
});

function formatInagiffyHelpMessage() {
    return [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Inagiffy Task Management System",
          emoji: false
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Complete list of available commands and features"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Task Assignment*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/assign @username task description [options]`*\nAssign a task to a team member\n\n*Options:*\n• `-urgent` - Set as high priority (1-day deadline)\n• `-team=teamname` - Specify team (content, product, design, ops)\n• `-deadline=YYYY-MM-DD` - Set custom deadline"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Examples:*\n• `/assign @sarah Write Q2 marketing report -team=content`\n• `/assign @john Update homepage design -urgent`\n• `/assign @alex Finalize budget -team=ops -deadline=2025-05-15`"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Task Management*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/tasks [filters]`*\nView and filter tasks\n\n*Filter options:*\n• `@username` - View a specific user's tasks\n• `stage=teamname` - Filter by team (content, product, design, ops)\n• `priority=level` - Filter by priority (high, medium, low)\n• `status=state` - Filter by status (pending, completed)"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Examples:*\n• `/tasks @david` - View David's tasks\n• `/tasks stage=design priority=high` - View high priority design tasks\n• `/tasks status=pending` - View all pending tasks"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Task Completion*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/markdone [taskId or task name]`*\nMark a task as complete\n\n*Examples:*\n• `/markdone 1682514937123` - Mark task by ID\n• `/markdone marketing report` - Mark task by name"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Chat Interaction*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "You can also interact with the bot in direct messages using these command formats:\n\n• `assign @username task description [options]`\n• `tasks [filters]`\n• `markdone [taskId or task name]`\n• `help`"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Help Commands*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/taskhelp`*\nBasic help with key commands\n\n*`/inagiffyhelp`*\nComprehensive help with all commands and examples"
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Inagiffy Task Management | Version 1.0"
          }
        ]
      }
    ];
  }
  
  // Register the /inagiffyhelp command
  app.command('/inagiffyhelp', async ({ command, ack, respond, logger }) => {
    logger.info('Received /inagiffyhelp command:', command);
    
    try {
      // Acknowledge the command right away
      await ack();
      
      // Generate the comprehensive help message
      const blocks = formatInagiffyHelpMessage();
      
      // Respond with the help message
      await respond({
        blocks,
        text: "Inagiffy Task Management System - Help Guide",
        response_type: "ephemeral" // Only visible to the user who triggered it
      });
      
      logger.info('Sent inagiffyhelp response to user:', command.user_id);
    } catch (error) {
      logger.error('Error in /inagiffyhelp command:', error);
      
      try {
        await respond({
          text: `Error displaying help: ${error.message}`,
          response_type: "ephemeral"
        });
      } catch (respondError) {
        logger.error('Error sending error response for inagiffyhelp:', respondError);
      }
    }
  });

// Handle direct messages with command processing capability
app.event('message', async ({ message, say, client, logger }) => {
  // Only respond to DMs (messages with channel_type=im)
  if (message.channel_type === 'im') {
    logger.info('Received DM:', message);
    
    // Check if this looks like a command
    const commandObj = processMessageCommand(message.text);
    
    if (commandObj) {
      // Process as a command
      logger.info(`Processing message as command: ${commandObj.command}`);
      
      if (commandObj.command === 'assign') {
        // Handle assign command
        const args = parseCommandArgs(commandObj.text);
        
        if (!args.userId || !args.taskDescription) {
          await say(`Usage: assign @username task description [-urgent] [-team=teamname] [-deadline=YYYY-MM-DD]`);
          return;
        }
        
        try {
          // Get user's existing tasks
          const existingTasks = await getUserPendingTasks(args.userId);
          
          // Determine stage based on task or specified team
          const stage = determineStage(args.taskDescription, args.team);
          
          // Default priority (urgent tasks are always high priority)
          const priority = args.isUrgent ? 'high' : 'low';
          
          // Create the task
          const task = await createTask(
            stage, 
            priority, 
            args.userId, 
            args.taskDescription, 
            message.channel, 
            args.isUrgent,
            args.deadline
          );
          
          // Generate professional response with blocks
          const blocks = formatAssignmentMessage(task, existingTasks);
          
          // Notify in DM
          await say({
            blocks,
            text: `Task assigned to <@${args.userId}>`
          });
          
          // Send a notification to the assignee if different from the current user
          if (args.userId !== message.user) {
            try {
              await client.chat.postMessage({
                channel: args.userId,
                text: `You've been assigned a new task: ${task.task}`,
                blocks: formatDMNotification(task)
              });
              logger.info(`DM sent to user ${args.userId}`);
            } catch (error) {
              logger.error(`Failed to DM user ${args.userId}:`, error);
            }
          }
        } catch (error) {
          logger.error('Error processing assign command in DM:', error);
          await say(`Error creating task: ${error.message}`);
        }
      } else if (commandObj.command === 'tasks') {
        // Handle tasks command
        const text = commandObj.text.trim();
        const filters = {};
        
        // Check if the user is looking for someone's tasks
        if (text.includes('@')) {
          const userId = extractUserId(text);
          if (userId) {
            filters.assignee = userId;
          }
        } else {
          // Parse other filters
          const args = text.split(' ');
          
          args.forEach(arg => {
            const [key, value] = arg.split('=');
            if (key && value) {
              filters[key] = value;
            }
          });
        }
        
        logger.debug('Parsed filters for tasks command in DM:', filters);
        
        try {
          const tasks = await getTasksList(filters);
          
          if (tasks.length === 0) {
            await say(filters.assignee 
              ? `No tasks found for <@${filters.assignee}>.`
              : 'No tasks found matching your filters.');
            return;
          }
          
          // Use the professional task list formatter
          const blocks = formatTaskList(tasks, filters);
          
          await say({
            blocks,
            text: `Found ${tasks.length} tasks`
          });
        } catch (error) {
          logger.error('Error processing tasks command in DM:', error);
          await say(`Error fetching tasks: ${error.message}`);
        }
      } else if (commandObj.command === 'markdone') {
        // Handle markdone command
        const text = commandObj.text.trim();
        
        if (!text) {
          await say('Usage: markdone [taskId or task name]');
          return;
        }
        
        try {
          let task;
          
          // Check if text is a task ID (numeric)
          if (/^\d+$/.test(text)) {
            task = await markTaskAsDone(text);
          } else {
            // Otherwise, treat it as a task name and find the task by name
            const foundTask = await getTaskByName(text, message.user);
            
            if (foundTask) {
              task = await markTaskAsDone(foundTask.taskId);
            } else {
              await say(`No task found with name containing "${text}". Please check the task name and try again.`);
              return;
            }
          }
          
          if (!task) {
            await say(`Task with ID/name "${text}" not found or you don't have permission to mark it as done.`);
            return;
          }
          
          // Use the professional completion formatter
          const blocks = formatCompletionMessage(task, message.user);
          
          await say({
            blocks,
            text: `Task ${task.task} marked as completed`
          });
          
          // Notify the original channel if different from the current DM
          if (task.channel !== message.channel) {
            try {
              await client.chat.postMessage({
                channel: task.channel,
                text: `Task "${task.task}" has been completed by <@${message.user}>`,
                blocks: formatCompletionMessage(task, message.user)
              });
              logger.info(`Channel ${task.channel} notified of task completion`);
            } catch (error) {
              logger.warn(`Could not post completion message to channel ${task.channel}`);
            }
          }
        } catch (error) {
          logger.error('Error processing markdone command in DM:', error);
          await say(`Error marking task as done: ${error.message}`);
        }
      } else if (commandObj.command === 'help') {
        // Handle help command
        const blocks = formatHelpMessage();
        
        await say({
          blocks,
          text: "Task Management Help"
        });
      }
    } else {
      // Not a command - send a helpful response
      const helpResponse = `Hello <@${message.user}>. I'm your task management assistant. You can use these commands in our conversation:

• *assign @username task description [-options]* - Create a new task
• *tasks [filters]* - View task list 
• *markdone [taskId or name]* - Complete a task
• *help* - Show command guide

Or you can use slash commands in channels: /assign, /tasks, /markdone, /taskhelp`;
      
      await say(helpResponse);
    }
  }
});

// Schedule reminder job to run every hour
cron.schedule('0 * * * *', sendReminders);

// Error handler
app.error((error) => {
  console.error('Global error handler caught:', error);
});

// Start the app
(async () => {
  try {
    await app.start(process.env.PORT || 3000);
    console.log('Inagiffy Task Management system is running');
    
    // Print important app info for debugging
    console.log(`Bot runs in Socket Mode: ${app.socketMode}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  } catch (error) {
    console.error('Failed to start app:', error);
    process.exit(1);
  }
})();
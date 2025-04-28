// services/taskService.js
const { formatDate, getPriorityIcon } = require('../utils/formatters');

let prisma;

function init(prismaClient) {
  prisma = prismaClient;
}

// Task Management Functions
async function createTask(team, priority, assignee, title, description, creator, channel, client, isUrgent = false, deadline = null) {
  console.log(`Creating task: team=${team}, priority=${priority}, assignee=${assignee}, isUrgent=${isUrgent}, custom deadline=${deadline}`);
  
  // Calculate deadline based on priority if not provided
  let taskDeadline;
  if (deadline) {
    // Use the provided deadline
    taskDeadline = new Date(deadline);
    
    // Set time to end of workday (5 PM) if not specified
    if (deadline.length <= 10) { // YYYY-MM-DD format
      taskDeadline.setHours(17, 0, 0, 0);
    }
  } else {
    // Calculate based on priority
    const deadlineMap = {
      'urgent': 1,
      'high': 2,
      'medium': 3,
      'low': 5
    };
    
    taskDeadline = new Date();
    taskDeadline.setDate(taskDeadline.getDate() + deadlineMap[isUrgent ? 'urgent' : priority]);
    taskDeadline.setHours(17, 0, 0, 0); // Set to 5 PM
  }
  
  try {
    // Create task in database
    const task = await prisma.task.create({
      data: {
        title,
        description,
        team,
        priority: isUrgent ? 'urgent' : priority,
        assignee,
        creator,
        channel,
        client,
        createdAt: new Date(),
        deadline: taskDeadline,
        status: 'pending',
        taskId: 'task_' + Date.now().toString(),
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
        status: {
          not: 'completed'
        }
      },
      orderBy: [
        { priority: 'asc' },
        { deadline: 'asc' }
      ]
    });
    
    console.log(`Found ${tasks.length} pending tasks for user ${assignee}`);
    return tasks;
  } catch (error) {
    console.error(`Error fetching tasks for user ${assignee}:`, error);
    return [];
  }
}

async function getTaskByDescription(description, assignee = null) {
  console.log(`Looking for task with description like: ${description}, assignee: ${assignee || 'any'}`);
  
  const where = {
    OR: [
      {
        title: {
          contains: description,
          mode: 'insensitive'
        }
      },
      {
        description: {
          contains: description,
          mode: 'insensitive'
        }
      }
    ]
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
    console.error(`Error finding task by description: ${error}`);
    return null;
  }
}

async function getTasksList(filters = {}) {
  console.log('Getting tasks list with filters:', filters);
  const where = {};
  
  // Apply filters if provided
  if (filters.team) {
    where.team = filters.team;
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
  if (filters.client) {
    where.client = filters.client;
  }
  if (filters.channel) {
    where.channel = filters.channel;
  }
  
  try {
    const tasks = await prisma.task.findMany({
      where,
      orderBy: [
        { status: 'asc' },
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

async function markTaskAsDone(taskId, userId) {
  console.log(`Marking task as done: ${taskId} by user ${userId}`);
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

async function sendTaskReminders(client) {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    console.log(`Checking for tasks due between ${now.toISOString()} and ${oneHourFromNow.toISOString()}`);
    
    // Get tasks with deadlines within the next hour
    const tasks = await prisma.task.findMany({
      where: {
        status: {
          not: 'completed'
        },
        deadline: {
          lte: oneHourFromNow,
          gt: now
        },
        reminderSent: false
      }
    });
    
    console.log(`Found ${tasks.length} tasks that need reminders`);
    
    for (const task of tasks) {
      try {
        // Send reminder to assignee
        await client.chat.postMessage({
          channel: task.assignee,
          text: `Reminder: Task "${task.title}" is due within the next hour`,
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
    
    return tasks.length;
  } catch (error) {
    console.error(`Error in reminder job:`, error);
    return 0;
  }
}

// Format task details for display
function formatTaskForDisplay(task) {
  const formattedDeadline = formatDate(task.deadline);
  
  const priority = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
  const priorityIcon = getPriorityIcon(task.priority);
  
  const teamLabels = {
    'content': 'Content',
    'design': 'Design',
    'product': 'Product',
    'ops': 'Operations'
  };
  
  const teamName = teamLabels[task.team] || task.team.charAt(0).toUpperCase() + task.team.slice(1);
  let statusDisplay;
  
  switch(task.status) {
    case 'pending':
      statusDisplay = 'Pending';
      break;
    case 'in_progress':
      statusDisplay = 'In Progress';
      break;
    case 'completed':
      statusDisplay = 'Completed';
      break;
    default:
      statusDisplay = task.status.charAt(0).toUpperCase() + task.status.slice(1);
  }
  
  let clientInfo = '';
  if (task.client) {
    clientInfo = `*Client:* ${task.client}\n`;
  }
  
  return `*${task.title}*\n${task.description}\n` +
         `*Priority:* ${priorityIcon} ${priority}\n` +
         `*Team:* ${teamName}\n` +
         `${clientInfo}` +
         `*Assigned to:* <@${task.assignee}>\n` +
         `*Due:* ${formattedDeadline}\n` +
         `*Status:* ${statusDisplay}`;
}

// Helper to format user's existing tasks for display
function formatExistingTasksList(tasks) {
  if (tasks.length === 0) {
    return "No current tasks assigned.";
  }
  
  const taskLines = tasks.map(task => {
    const dueDate = formatDate(task.deadline);
    const priorityIcon = getPriorityIcon(task.priority);
    return `${priorityIcon} *${task.title}* - due ${dueDate}`;
  });
  
  return taskLines.join('\n');
}

// Format assignment notification
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
        text: `Use \`/done ${task.title}\` to mark as complete when finished`
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
          action_id: "complete_task",
          style: "primary"
        }
      ]
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `This task was assigned from <#${task.channel}>${task.client ? ` for client ${task.client}` : ''}`
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
          text: `Completed by <@${completedByUserId}> on ${formatDate(new Date())}`
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
  } else if (filters.team) {
    headerText = `${filters.team.charAt(0).toUpperCase() + filters.team.slice(1)} Team Tasks`;
  } else if (filters.client) {
    headerText = `Tasks for ${filters.client}`;
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
    if (filters.team) filterDescriptions.push(`Team: ${filters.team}`);
    if (filters.priority) filterDescriptions.push(`Priority: ${filters.priority}`);
    if (filters.assignee) filterDescriptions.push(`Assignee: <@${filters.assignee}>`);
    if (filters.status) filterDescriptions.push(`Status: ${filters.status}`);
    if (filters.client) filterDescriptions.push(`Client: ${filters.client}`);
    
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
  
  if (tasks.length > 0) {
    blocks.push({
      type: "divider"
    });
  }
  
  // Tasks
  tasks.forEach((task, index) => {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: formatTaskForDisplay(task)
      }
    });
    
    // Add button for non-completed tasks
    if (task.status !== 'completed') {
      blocks.push({
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
      });
    }
    
    // Add divider between tasks (except for the last one)
    if (index < tasks.length - 1) {
      blocks.push({
        type: "divider"
      });
    }
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
        text: "⏰ Task Reminder",
        emoji: true
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
          action_id: "complete_task",
          style: "primary"
        }
      ]
    }
  ];
  
  return blocks;
}

async function getTasksList(filters = {}) {
    console.log('Getting tasks list with filters:', filters);
    const where = {};
    
    // Apply standard filters if provided
    if (filters.team) {
      where.team = filters.team;
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
    if (filters.client) {
      where.client = filters.client;
    }
    if (filters.channel) {
      where.channel = filters.channel;
    }
    
    // Date-based filters
    if (filters.completedSince) {
      where.completedAt = {
        gte: new Date(filters.completedSince)
      };
    }
    
    if (filters.createdSince) {
      where.createdAt = {
        gte: new Date(filters.createdSince)
      };
    }
    
    if (filters.dueBefore) {
      where.deadline = {
        lte: new Date(filters.dueBefore)
      };
    }
    
    try {
      const tasks = await prisma.task.findMany({
        where,
        orderBy: [
          { status: 'asc' },
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

module.exports = {
  init,
  createTask,
  getUserPendingTasks,
  getTaskByDescription,
  getTasksList,
  markTaskAsDone,
  sendTaskReminders,
  formatTaskForDisplay,
  formatExistingTasksList,
  formatAssignmentMessage,
  formatDMNotification,
  formatCompletionMessage,
  formatTaskList,
  formatReminderMessage
};
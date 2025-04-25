// message-formatters.js - Contains all the formatting functions for Inagiffy Bot messages

// Format task details for display with clean, professional style
function formatTaskForDisplay(task) {
    const formattedDeadline = `${task.deadline.toLocaleDateString()} ${task.deadline.toLocaleTimeString()}`;
    
    const priorityEmoji = {
      'high': '🔴',
      'medium': '🟡',
      'low': '🟢'
    };
    
    const stageEmoji = {
      'content': '📝',
      'design': '🎨',
      'product': '💻',
      'ops': '🔧',
      'qc': '🔍'
    };
    
    // Use default emoji if stage is not one of the predefined ones
    const emoji = stageEmoji[task.stage] || '📋';
    
    const statusDisplay = task.status === 'pending' ? 'In Progress' : 'Completed';
    
    return `*Task:* ${task.task}\n\n` +
           `*Priority:* ${priorityEmoji[task.priority]} ${task.priority}\n` +
           `*Team:* ${emoji} ${task.stage.charAt(0).toUpperCase() + task.stage.slice(1)}\n` +
           `*Assigned to:* <@${task.assignee}>\n` +
           `*Due:* ${formattedDeadline}\n` +
           `*Status:* ${statusDisplay}\n` +
           `*ID:* ${task.taskId}`;
  }
  
  // Helper to format user's existing tasks for display
  function formatExistingTasksList(tasks) {
    if (tasks.length === 0) {
      return "No existing tasks.";
    }
    
    const taskLines = tasks.map(task => {
      const priorityEmoji = {
        'high': '🔴',
        'medium': '🟡',
        'low': '🟢'
      };
      
      const dueDate = task.deadline.toLocaleDateString();
      return `${priorityEmoji[task.priority]} \`${task.task}\` • ${task.priority} • due ${dueDate}`;
    });
    
    return taskLines.join('\n');
  }
  
  // Format assignment notification with clean style
  function formatAssignmentMessage(task, existingTasks = []) {
    const hasExistingTasks = existingTasks.length > 0;
    
    let blocks = [];
    
    // Header section
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: "New Task Assigned",
        emoji: true
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
          text: `*Current workload for <@${task.assignee}>:*\n${formatExistingTasksList(existingTasks)}`
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
    const intros = [
      "You've been assigned a new task",
      "New task assigned to you",
      "Task assignment notification"
    ];
    
    const randomIntro = intros[Math.floor(Math.random() * intros.length)];
    
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: randomIntro,
          emoji: true
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
            text: `From <#${task.channel}>`
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
          emoji: true
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
    let headerText = "Tasks";
    if (filters.assignee) {
      headerText = `Tasks for <@${filters.assignee}>`;
    } else if (Object.keys(filters).length > 0) {
      headerText = "Filtered Tasks";
    }
    
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: headerText,
        emoji: true
      }
    });
    
    // Summary
    let summaryText = `Found ${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
    
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
              text: `Filters: ${filterDescriptions.join(' • ')}`
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
      
      blocks.push({
        type: "divider"
      });
    });
    
    // Help context
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Use `/taskhelp` for more commands and options"
        }
      ]
    });
    
    return blocks;
  }
  
  // Format reminder notification
  function formatReminderMessage(task) {
    const dueIn = Math.floor((task.deadline - new Date()) / (1000 * 60 * 60));
    
    const dueText = dueIn <= 1 
      ? "Due in less than an hour" 
      : `Due in about ${dueIn} hours`;
    
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Task Reminder",
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
              emoji: true
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
          text: "Inagiffy Bot Commands",
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Here's how to use the task management commands:"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/assign @username task description [options]`*\nAssign a task to someone\n\n*Options:*\n• `-urgent` - High priority (1 day deadline)\n• `-team=teamname` - Specify team (content, product, design, ops)\n• `-deadline=YYYY-MM-DD` - Custom due date"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/tasks [filters]`*\nList tasks with optional filters\n\n*Examples:*\n• `/tasks` - Show all tasks\n• `/tasks @username` - Show tasks for a person\n• `/tasks stage=design priority=high` - Filter by criteria"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/markdone [taskId or task name]`*\nMark a task as completed\n\n*Examples:*\n• `/markdone 1682514937123` - Complete by ID\n• `/markdone newsletter draft` - Complete by task name"
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
            text: "Inagiffy Bot | Streamlining your workflow"
          }
        ]
      }
    ];
  }
  
  module.exports = {
    formatTaskForDisplay,
    formatExistingTasksList,
    formatAssignmentMessage,
    formatDMNotification,
    formatCompletionMessage,
    formatTaskList,
    formatReminderMessage,
    formatHelpMessage
  };
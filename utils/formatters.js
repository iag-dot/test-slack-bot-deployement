// utils/formatters.js

// Format date in a user-friendly way
function formatDate(date) {
    if (!date) return 'No date set';
    
    const options = { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return new Date(date).toLocaleString('en-US', options);
  }
  
  // Get icon for priority level
  function getPriorityIcon(priority) {
    switch(priority.toLowerCase()) {
      case 'urgent':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  }
  
  // Format comprehensive help message
  function formatHelpMessage() {
    return [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Inagiffy Bot Command Reference",
          emoji: false
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Welcome to the Inagiffy Bot help guide. Here are all the commands you can use to manage tasks, reviews, and content workflows."
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
          text: "*`/assign @username [task] [options]`*\nAssign a new task to a team member\n\n*Options:*\n• `-urgent` - Set as high priority with urgent deadline\n• `-team=teamname` - Specify team (content, design, product, ops)\n• `-priority=level` - Set priority (urgent, high, medium, low)\n• `-deadline=YYYY-MM-DD` - Set custom due date\n• `-client=clientname` - Associate with specific client"
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
          text: "*View Tasks*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/tasks [filters]`*\nView and filter tasks\n\n*Filter options:*\n• `@username` - View a specific user's tasks\n• `team=teamname` - Filter by team (content, design, product, ops)\n• `priority=level` - Filter by priority (urgent, high, medium, low)\n• `status=state` - Filter by status (pending, in_progress, completed)\n• `client=clientname` - Filter by client"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Examples:*\n• `/tasks @david` - View David's tasks\n• `/tasks team=design priority=high` - View high priority design tasks\n• `/tasks client=acme` - View all tasks for Acme client"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Complete Tasks*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/done [task description]`*\nMark a task as complete\n\n*Examples:*\n• `/done Write Q2 marketing report` - Complete task by description\n• `/done homepage design` - Complete task by partial description"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Content Reviews*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/review [title] [options]`*\nRequest a review for content\n\n*Options:*\n• `#channel` - Specify client channel\n• `@reviewer1 @reviewer2` - Tag reviewers directly\n• `-url=link` - Link to the content being reviewed\n• `-deadline=YYYY-MM-DD` - Set review deadline\n• `-status=stage` - Set initial status (draft, design, in_review, approved, published)"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Examples:*\n• `/review April Newsletter #acme @sarah @john -url=https://docs.google.com/doc`\n• `/review Homepage Redesign @alex -status=design -deadline=2025-05-10`"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Content Status*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/client-status [client]`*\nCheck content status for a client\n\n*Examples:*\n• `/client-status` - Check status for current channel\n• `/client-status #acme` - Check status for Acme client channel\n• `/client-status sunroof` - Check status for Sunroof client by name"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Approve Content*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/approve [review title or ID] [optional comment]`*\nApprove content for publishing\n\n*Examples:*\n• `/approve April Newsletter` - Approve by title\n• `/approve #acme Homepage Redesign` - Approve with client prefix\n• `/approve Q2 Report \"Looks great, ready to publish\"` - Include approval comment"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Direct Message Usage*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "You can also interact with Inagiffy Bot in direct messages using these command formats (without the slash):\n\n• `assign @username [task] [options]`\n• `tasks [filters]`\n• `done [task description]`\n• `review [title] [options]`\n• `approve [title] [comment]`\n• `status [client]`\n• `help` - Show this guide"
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Inagiffy Bot | Version 2.0"
          }
        ]
      }
    ];
  }
  
  module.exports = {
    formatDate,
    getPriorityIcon,
    formatHelpMessage
  };
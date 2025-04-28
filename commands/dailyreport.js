// commands/dailyreport.js
const taskService = require('../services/taskService');
const reviewService = require('../services/reviewService');
const { formatDate } = require('../utils/formatters');

async function handleDailyReportCommand({ command, respond, client, logger, isDM = false }) {
  logger.info('Processing /dailyreport command:', command);
  
  try {
    const text = command.text.trim();
    let filters = {};
    
    // Parse filters if provided
    if (text) {
      const parts = text.split(' ');
      
      for (const part of parts) {
        if (part.includes('=')) {
          const [key, value] = part.split('=');
          if (key && value) {
            filters[key] = value;
          }
        }
      }
    }
    
    logger.debug('Report filters:', filters);
    
    // Get today's date at start of day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get tomorrow's date at start of day
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get completed tasks for today
    const completedToday = await taskService.getTasksList({
      ...filters,
      status: 'completed',
      completedSince: today.toISOString()
    });
    
    // Get tasks created today
    const createdToday = await taskService.getTasksList({
      ...filters,
      createdSince: today.toISOString()
    });
    
    // Get reviews with activity today
    const reviewActivity = await reviewService.getReviews({
      ...filters,
      activitySince: today.toISOString()
    });
    
    // Group tasks by team
    const teamTasks = {
      content: { completed: [], created: [] },
      design: { completed: [], created: [] },
      product: { completed: [], created: [] },
      ops: { completed: [], created: [] }
    };
    
    completedToday.forEach(task => {
      if (teamTasks[task.team]) {
        teamTasks[task.team].completed.push(task);
      } else {
        if (!teamTasks.other) teamTasks.other = { completed: [], created: [] };
        teamTasks.other.completed.push(task);
      }
    });
    
    createdToday.forEach(task => {
      if (teamTasks[task.team]) {
        teamTasks[task.team].created.push(task);
      } else {
        if (!teamTasks.other) teamTasks.other = { completed: [], created: [] };
        teamTasks.other.created.push(task);
      }
    });
    
    // Format the report
    const blocks = formatDailyReport(teamTasks, reviewActivity, today, filters);
    
    await respond({
      blocks,
      text: `Daily Activity Report for ${formatDate(today)}`,
      response_type: isDM ? 'in_channel' : 'ephemeral'
    });
    
  } catch (error) {
    logger.error('Error generating daily report:', error);
    await respond({
      text: `Error generating report: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

function formatDailyReport(teamTasks, reviewActivity, date, filters = {}) {
  const formattedDate = formatDate(date);
  
  // Calculate totals
  let totalCompleted = 0;
  let totalCreated = 0;
  
  for (const team in teamTasks) {
    totalCompleted += teamTasks[team].completed.length;
    totalCreated += teamTasks[team].created.length;
  }
  
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Daily Activity Report - ${formattedDate}`,
        emoji: false
      }
    }
  ];

  // If a specific team filter was applied, show just that team
  if (filters.team) {
    const team = filters.team;
    const teamData = teamTasks[team] || { completed: [], created: [] };
    
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${team.charAt(0).toUpperCase() + team.slice(1)} Team Summary:*\n• ${teamData.completed.length} tasks completed\n• ${teamData.created.length} new tasks created`
      }
    });
    
    // Completed tasks for this team
    if (teamData.completed.length > 0) {
      blocks.push(
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Completed Tasks (${teamData.completed.length}):*`
          }
        }
      );
      
      teamData.completed.forEach(task => {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `• *${task.title}*\n   Completed by <@${task.assignee}>`
          }
        });
      });
    }
    
    // New tasks for this team
    if (teamData.created.length > 0) {
      blocks.push(
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*New Tasks (${teamData.created.length}):*`
          }
        }
      );
      
      teamData.created.forEach(task => {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `• *${task.title}*\n   Assigned to <@${task.assignee}> by <@${task.creator}>\n   Due: ${formatDate(task.deadline)}`
          }
        });
      });
    }
    
  } else {
    // Overall summary for all teams
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Overall Activity:*\n• ${totalCompleted} tasks completed\n• ${totalCreated} new tasks created\n• ${reviewActivity.length} review activities`
      }
    });
    
    blocks.push({
      type: "divider"
    });
    
    // Add summary by team
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Team Performance:*"
      }
    });
    
    // Add each team's stats
    for (const team in teamTasks) {
      const teamData = teamTasks[team];
      if (teamData.completed.length > 0 || teamData.created.length > 0) {
        const teamName = team.charAt(0).toUpperCase() + team.slice(1);
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `• *${teamName}:* ${teamData.completed.length} tasks completed, ${teamData.created.length} new tasks created`
          }
        });
      }
    }
    
    // Add more detailed sections for teams with significant activity
    for (const team in teamTasks) {
      const teamData = teamTasks[team];
      
      // Only show details for teams with activity
      if (teamData.completed.length > 0 || teamData.created.length > 0) {
        const teamName = team.charAt(0).toUpperCase() + team.slice(1);
        
        blocks.push({
          type: "divider"
        });
        
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${teamName} Team Activity:*`
          }
        });
        
        // Completed tasks
        if (teamData.completed.length > 0) {
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Completed Tasks (${teamData.completed.length}):*\n${teamData.completed.map(task => `• ${task.title}`).join('\n')}`
            }
          });
        }
        
        // New tasks
        if (teamData.created.length > 0) {
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*New Tasks (${teamData.created.length}):*\n${teamData.created.map(task => `• ${task.title}`).join('\n')}`
            }
          });
        }
      }
    }
  }
  
  // Review activity if available and not filtered by team
  if (reviewActivity.length > 0 && !filters.team) {
    blocks.push({
      type: "divider"
    });
    
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Content Review Activity:*"
      }
    });
    
    // Group by client
    const clientReviews = {};
    reviewActivity.forEach(review => {
      if (!clientReviews[review.client]) {
        clientReviews[review.client] = [];
      }
      clientReviews[review.client].push(review);
    });
    
    for (const client in clientReviews) {
      const reviews = clientReviews[client];
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${client}:* ${reviews.length} items\n${reviews.map(review => `• ${review.title} (${reviewService.formatStatus(review.status)})`).join('\n')}`
        }
      });
    }
  }
  
  // Add footer
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "Inagiffy Bot | Daily Activity Report"
      }
    ]
  });
  
  return blocks;
}

module.exports = {
  handleDailyReportCommand
};
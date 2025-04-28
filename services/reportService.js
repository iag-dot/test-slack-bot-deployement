// services/reportService.js
const { formatDate } = require('../utils/formatters');

let prisma;

function init(prismaClient) {
  prisma = prismaClient;
}

// Generate daily report
async function generateDailyReport(client) {
  console.log('Generating daily report');
  
  try {
    // Get today's date at start of day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get tomorrow's date at start of day
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get completed tasks for today
    const completedTasks = await prisma.task.findMany({
      where: {
        completedAt: {
          gte: today,
          lt: tomorrow
        },
        status: 'completed'
      }
    });
    
    // Get new tasks created today
    const newTasks = await prisma.task.findMany({
      where: {
        createdAt: {
          gte: today,
          lt: tomorrow
        }
      }
    });
    
    // Get reviews that changed status today
    const reviewActivity = await prisma.review.findMany({
      where: {
        OR: [
          {
            createdAt: {
              gte: today,
              lt: tomorrow
            }
          },
          {
            completedAt: {
              gte: today,
              lt: tomorrow
            }
          }
        ]
      },
      include: {
        feedbacks: {
          where: {
            createdAt: {
              gte: today,
              lt: tomorrow
            }
          }
        }
      }
    });
    
    // Group tasks by team
    const teamTasks = {
      content: { completed: [], new: [] },
      design: { completed: [], new: [] },
      product: { completed: [], new: [] },
      ops: { completed: [], new: [] }
    };
    
    completedTasks.forEach(task => {
      if (teamTasks[task.team]) {
        teamTasks[task.team].completed.push(task);
      } else {
        teamTasks.other = teamTasks.other || { completed: [], new: [] };
        teamTasks.other.completed.push(task);
      }
    });
    
    newTasks.forEach(task => {
      if (teamTasks[task.team]) {
        teamTasks[task.team].new.push(task);
      } else {
        teamTasks.other = teamTasks.other || { completed: [], new: [] };
        teamTasks.other.new.push(task);
      }
    });
    
    // Group reviews by client
    const clientReviews = {};
    reviewActivity.forEach(review => {
      if (!clientReviews[review.client]) {
        clientReviews[review.client] = [];
      }
      clientReviews[review.client].push(review);
    });
    
    // Store report in database
    const report = await prisma.dailyReport.create({
      data: {
        date: today,
        teamReports: JSON.stringify({
          tasks: teamTasks,
          reviews: clientReviews,
          summary: {
            tasksCompleted: completedTasks.length,
            tasksCreated: newTasks.length,
            reviewsActive: reviewActivity.length
          }
        }),
        createdAt: new Date()
      }
    });
    
    // Send report to appropriate channels
    await sendReportToChannels(client, teamTasks, clientReviews, today);
    
    return report;
  } catch (error) {
    console.error('Error generating daily report:', error);
    return null;
  }
}

// Send reports to team and general channels
async function sendReportToChannels(client, teamTasks, clientReviews, date) {
  try {
    // Send team-specific reports
    for (const [team, tasks] of Object.entries(teamTasks)) {
      // Skip teams with no activity
      if (tasks.completed.length === 0 && tasks.new.length === 0) {
        continue;
      }
      
      // Try to find team channel
      const channelName = `team-${team}`;
      try {
        const result = await client.conversations.list();
        const channel = result.channels.find(c => c.name === channelName);
        
        if (channel) {
          await client.chat.postMessage({
            channel: channel.id,
            blocks: formatTeamReport(team, tasks, date),
            text: `Daily ${team} team report for ${formatDate(date)}`
          });
          console.log(`Sent daily report to ${channelName}`);
        }
      } catch (error) {
        console.error(`Error sending report to ${channelName}:`, error);
      }
    }
    
    // Send summary to general channel
    try {
      const summaryChannel = 'general';
      const result = await client.conversations.list();
      const channel = result.channels.find(c => c.name === summaryChannel);
      
      if (channel) {
        await client.chat.postMessage({
          channel: channel.id,
          blocks: formatSummaryReport(teamTasks, clientReviews, date),
          text: `Daily team summary for ${formatDate(date)}`
        });
        console.log(`Sent summary report to ${summaryChannel}`);
      }
    } catch (error) {
      console.error('Error sending summary report:', error);
    }
  } catch (error) {
    console.error('Error distributing reports:', error);
  }
}

// Format a team-specific report
function formatTeamReport(team, tasks, date) {
  const teamName = team.charAt(0).toUpperCase() + team.slice(1);
  const formattedDate = formatDate(date);
  
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${teamName} Team Report - ${formattedDate}`,
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Summary:* Completed ${tasks.completed.length} tasks, Created ${tasks.new.length} tasks`
      }
    }
  ];
  
  // Completed tasks section
  if (tasks.completed.length > 0) {
    blocks.push(
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Completed Tasks (${tasks.completed.length}):*`
        }
      }
    );
    
    tasks.completed.forEach(task => {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *${task.title}*\n   Completed by <@${task.assignee}>`
        }
      });
    });
  }
  
  // New tasks section
  if (tasks.new.length > 0) {
    blocks.push(
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New Tasks (${tasks.new.length}):*`
        }
      }
    );
    
    tasks.new.forEach(task => {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *${task.title}*\n   Assigned to <@${task.assignee}> by <@${task.creator}>\n   Due: ${formatDate(task.deadline)}`
        }
      });
    });
  }
  
  // Add footer
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "Inagiffy Bot | Daily Team Report"
      }
    ]
  });
  
  return blocks;
}

// Format a summary report for general channel
function formatSummaryReport(teamTasks, clientReviews, date) {
  const formattedDate = formatDate(date);
  
  // Calculate totals
  let totalCompleted = 0;
  let totalNew = 0;
  
  for (const tasks of Object.values(teamTasks)) {
    totalCompleted += tasks.completed.length;
    totalNew += tasks.new.length;
  }
  
  const clientCount = Object.keys(clientReviews).length;
  const reviewCount = Object.values(clientReviews).reduce((sum, reviews) => sum + reviews.length, 0);
  
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Daily Team Summary - ${formattedDate}`,
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Overall Activity:*\n• ${totalCompleted} tasks completed\n• ${totalNew} new tasks created\n• ${reviewCount} review activities for ${clientCount} clients`
      }
    },
    {
      type: "divider"
    }
  ];
  
  // Team summaries
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*Team Performance:*"
    }
  });
  
  for (const [team, tasks] of Object.entries(teamTasks)) {
    if (tasks.completed.length > 0 || tasks.new.length > 0) {
      const teamName = team.charAt(0).toUpperCase() + team.slice(1);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *${teamName}:* ${tasks.completed.length} tasks completed, ${tasks.new.length} new tasks`
        }
      });
    }
  }
  
  // Client review activity if present
  if (Object.keys(clientReviews).length > 0) {
    blocks.push(
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Client Review Activity:*"
        }
      }
    );
    
    for (const [client, reviews] of Object.entries(clientReviews)) {
      const approved = reviews.filter(r => r.status === 'approved' || r.status === 'published').length;
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• *${client}:* ${reviews.length} items in review, ${approved} approved`
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
        text: "Inagiffy Bot | Daily Summary Report"
      }
    ]
  });
  
  return blocks;
}

module.exports = {
  init,
  generateDailyReport
};
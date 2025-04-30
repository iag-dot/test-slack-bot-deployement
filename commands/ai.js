// commands/ai.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const taskService = require('../services/taskService');
const reviewService = require('../services/reviewService');

// Initialize the Generative AI API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Define system prompt that explains what your bot can do
const SYSTEM_PROMPT = `
You are an AI assistant for a task and review management system in Slack.
You can help users with the following:

1. Answer questions about tasks and reviews in the system
2. Create new tasks and assign them to team members
3. Request reviews for content
4. Provide status updates about clients and projects

The system has:
- Tasks with assignees, teams, and priorities
- Reviews with reviewers and approval status
- Client information and team assignments

Respond in a helpful, friendly tone. When performing actions, be specific about what you're doing.
`;

// Helper function to extract user ID from a mention
function extractUserIdFromName(name, users) {
  // Remove special characters and whitespace
  const cleanName = name.toLowerCase().trim().replace(/[^\w]/g, '');
  
  // Find the closest matching user
  for (const user of users) {
    const userName = user.name.toLowerCase();
    const realName = (user.real_name || '').toLowerCase();
    const displayName = (user.profile?.display_name || '').toLowerCase();
    
    if (userName.includes(cleanName) || 
        realName.includes(cleanName) || 
        displayName.includes(cleanName)) {
      return user.id;
    }
  }
  
  return null;
}

// Function to determine intent and extract entities
async function analyzeQuery(query) {
  try {
    const prompt = `
${SYSTEM_PROMPT}

The user has sent this query: "${query}"

Analyze this query and extract:
1. Intent (one of: query_info, assign_task, request_review, check_status, unknown)
2. Client name (if mentioned)
3. User names (if mentioned)
4. Task details (if applicable)
5. Priority (if mentioned)
6. Team (if mentioned)

Format your response as valid JSON like this:
{
  "intent": "intent_type",
  "client": "client_name or null",
  "users": ["user1", "user2"],
  "task_title": "task description or null",
  "priority": "priority or null",
  "team": "team name or null"
}
`;

    const result = await model.generateContent(prompt + query);
    const response = result.response.text();
    
    // Extract the JSON from the response
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                       response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0].replace(/```json\n|```/g, ''));
    } else {
      console.error('Failed to parse JSON from LLM response:', response);
      return { intent: "unknown" };
    }
  } catch (error) {
    console.error('Error analyzing query with LLM:', error);
    return { intent: "unknown" };
  }
}

// Get system context from database
async function getSystemContext() {
  try {
    // Get recent tasks
    const recentTasks = await taskService.getTasksList({});
    
    // Get recent reviews
    const recentReviews = await reviewService.getReviews({});
    
    // Format as context
    return `
Here's the current state of the system:

Recent Tasks (${recentTasks.length}):
${recentTasks.slice(0, 10).map(t => 
  `- "${t.title}" assigned to ${t.assigneeName || t.assignee}, client: ${t.client || 'none'}, status: ${t.status}, team: ${t.team}`
).join('\n')}

Recent Reviews (${recentReviews.length}):
${recentReviews.slice(0, 10).map(r => 
  `- "${r.title}" for client: ${r.client}, status: ${r.status}, created by: ${r.creatorName || r.creatorId}`
).join('\n')}
`;
  } catch (error) {
    console.error('Error getting system context:', error);
    return '';
  }
}

// Main command handler
async function handleAiCommand({ command, respond, client, logger, isDM = false }) {
  logger.info('Processing /ai command:', command);
  
  try {
    const query = command.text.trim();
    
    if (!query) {
      await respond({
        text: 'Please provide a question or request. For example: "/ai who is working on the newsletter for client X?"',
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Show typing indicator
    await respond({
      text: "Thinking...",
      response_type: 'ephemeral'
    });
    
    // Get context from the database
    const systemContext = await getSystemContext();
    
    // Analyze the query
    const analysis = await analyzeQuery(query);
    logger.debug('Query analysis:', analysis);
    
    // Get all users for name matching
    const usersList = await client.users.list();
    const users = usersList.members;
    
    // Respond based on intent
    switch (analysis.intent) {
      case "query_info":
        await handleInfoQuery(analysis, query, systemContext, respond, client, logger);
        break;
        
      case "assign_task":
        await handleTaskAssignment(analysis, command.user_id, command.channel_id, respond, client, users, logger);
        break;
        
      case "request_review":
        await handleReviewRequest(analysis, command.user_id, command.channel_id, respond, client, users, logger);
        break;
        
      case "check_status":
        await handleStatusCheck(analysis, respond, client, logger);
        break;
        
      default:
        await respond({
          text: "I'm not sure how to help with that request. Try asking about tasks, reviews, or client status.",
          response_type: 'ephemeral'
        });
    }
    
  } catch (error) {
    logger.error('Error handling AI command:', error);
    await respond({
      text: `Sorry, I encountered an error processing your request: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

// Handle information queries
async function handleInfoQuery(analysis, originalQuery, systemContext, respond, client, logger) {
  try {
    let filters = {};
    
    // Apply filters based on analysis
    if (analysis.client) {
      filters.client = analysis.client;
    }
    
    if (analysis.users && analysis.users.length > 0) {
      // Get user list to resolve names to IDs
      const usersList = await client.users.list();
      const userId = extractUserIdFromName(analysis.users[0], usersList.members);
      if (userId) {
        filters.assignee = userId;
      }
    }
    
    if (analysis.team) {
      filters.team = analysis.team.toLowerCase();
    }
    
    // Get tasks and reviews based on filters
    const tasks = await taskService.getTasksList(filters);
    const reviews = await reviewService.getReviews(filters);
    
    // Generate a response based on the query results
    const promptForResponse = `
${SYSTEM_PROMPT}

${systemContext}

The user asked: "${originalQuery}"

Here's what I found in the database based on their query:

Tasks (${tasks.length}):
${tasks.map(t => `- "${t.title}" assigned to ${t.assigneeName || t.assignee}, client: ${t.client || 'none'}, status: ${t.status}`).join('\n')}

Reviews (${reviews.length}):
${reviews.map(r => `- "${r.title}" created by ${r.creatorName || r.creatorId}, client: ${r.client}, status: ${r.status}`).join('\n')}

Based on this information, provide a helpful response to the user's query. Be specific and concise.`;

    const result = await model.generateContent(promptForResponse);
    const response = result.response.text();
    
    await respond({
      text: response,
      response_type: 'ephemeral'
    });
    
  } catch (error) {
    logger.error('Error handling info query:', error);
    await respond({
      text: `Sorry, I couldn't retrieve that information: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

// Handle task assignment
async function handleTaskAssignment(analysis, creatorId, channelId, respond, client, users, logger) {
  try {
    // Validate required fields
    if (!analysis.task_title) {
      await respond({
        text: "I need a task description to create a task. Please specify what needs to be done.",
        response_type: 'ephemeral'
      });
      return;
    }
    
    if (!analysis.users || analysis.users.length === 0) {
      await respond({
        text: "I need to know who to assign the task to. Please mention a team member in your request.",
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Get creator information
    const creatorInfo = await client.users.info({ user: creatorId });
    const creatorName = creatorInfo.user.real_name || creatorInfo.user.name;
    
    // Get assignee information
    const assigneeId = extractUserIdFromName(analysis.users[0], users);
    if (!assigneeId) {
      await respond({
        text: `I couldn't find a user matching "${analysis.users[0]}". Please use their Slack username.`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    const assigneeInfo = await client.users.info({ user: assigneeId });
    const assigneeName = assigneeInfo.user.real_name || assigneeInfo.user.name;
    
    // Get channel information
    let channelName = null;
    try {
      const channelInfo = await client.conversations.info({ channel: channelId });
      channelName = channelInfo.channel.name;
    } catch (error) {
      logger.error(`Error fetching channel info: ${error}`);
    }
    
    // Determine team and priority
    const team = analysis.team || "content";
    const priority = analysis.priority || "medium";
    
    // Create the task
    const task = await taskService.createTask(
      team,
      priority,
      assigneeId,
      assigneeName,
      analysis.task_title,
      analysis.task_title, // Use title as description if no separate description
      creatorId,
      creatorName,
      channelId,
      channelName,
      analysis.client,
      priority === "urgent",
      null // deadline
    );
    
    // Generate response for user
    await respond({
      text: `✅ I've assigned a new ${priority} priority task to ${assigneeName}:\n"${analysis.task_title}"${analysis.client ? ` for client ${analysis.client}` : ''}`,
      response_type: 'in_channel' // Make visible to everyone in the channel
    });
    
    // Notify assignee via DM
    await client.chat.postMessage({
      channel: assigneeId,
      text: `You've been assigned a new task: ${task.title}`,
      blocks: taskService.formatDMNotification(task)
    });
    
  } catch (error) {
    logger.error('Error handling task assignment:', error);
    await respond({
      text: `Sorry, I couldn't create that task: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

// Handle review request
async function handleReviewRequest(analysis, creatorId, channelId, respond, client, users, logger) {
  try {
    // Validate required fields
    if (!analysis.task_title) {
      await respond({
        text: "I need a content title to create a review request. Please specify what needs to be reviewed.",
        response_type: 'ephemeral'
      });
      return;
    }
    
    if (!analysis.users || analysis.users.length === 0) {
      await respond({
        text: "I need to know who should review the content. Please mention at least one reviewer in your request.",
        response_type: 'ephemeral'
      });
      return;
    }
    
    if (!analysis.client) {
      await respond({
        text: "Please specify which client this review is for.",
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Get creator information
    const creatorInfo = await client.users.info({ user: creatorId });
    const creatorName = creatorInfo.user.real_name || creatorInfo.user.name;
    
    // Get channel information
    let channelName = null;
    try {
      const channelInfo = await client.conversations.info({ channel: channelId });
      channelName = channelInfo.channel.name;
    } catch (error) {
      logger.error(`Error fetching channel info: ${error}`);
    }
    
    // Resolve reviewer names to IDs and collect their display names
    const reviewerIds = [];
    const reviewerNames = [];
    
    for (const username of analysis.users) {
      const reviewerId = extractUserIdFromName(username, users);
      if (reviewerId) {
        const reviewerInfo = await client.users.info({ user: reviewerId });
        const reviewerName = reviewerInfo.user.real_name || reviewerInfo.user.name;
        
        reviewerIds.push(reviewerId);
        reviewerNames.push(reviewerName);
      }
    }
    
    if (reviewerIds.length === 0) {
      await respond({
        text: "I couldn't find any valid users to assign as reviewers. Please use their Slack usernames.",
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Create the review
    const review = await reviewService.createReview(
      analysis.task_title,
      analysis.task_title, // Use title as description if no separate description
      creatorId,
      creatorName,
      reviewerIds,
      reviewerNames,
      channelId,
      channelName,
      analysis.client,
      null, // URL
      null, // Deadline
      "in_review" // Initial status
    );
    
    // Generate response for user
    await respond({
      text: `📝 I've created a review request for "${analysis.task_title}" for client ${analysis.client}.\nReviewers: ${reviewerNames.map((name, i) => `<@${reviewerIds[i]}>`).join(', ')}`,
      response_type: 'in_channel' // Make visible to everyone in the channel
    });
    
    // Notify reviewers
    for (let i = 0; i < reviewerIds.length; i++) {
      try {
        await client.chat.postMessage({
          channel: reviewerIds[i],
          blocks: reviewService.formatReviewNotification(review),
          text: `You've been asked to review "${review.title}" for ${analysis.client}`
        });
        logger.info(`Review notification sent to ${reviewerIds[i]}`);
      } catch (error) {
        logger.error(`Error sending review notification to ${reviewerIds[i]}:`, error);
      }
    }
    
  } catch (error) {
    logger.error('Error handling review request:', error);
    await respond({
      text: `Sorry, I couldn't create that review request: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

// Handle status check
async function handleStatusCheck(analysis, respond, client, logger) {
  try {
    // Get client name from analysis
    const clientName = analysis.client;
    
    if (!clientName) {
      await respond({
        text: "Please specify which client you'd like to check the status for.",
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Get all tasks and reviews for the client
    const tasks = await taskService.getTasksList({ client: clientName });
    const reviews = await reviewService.getReviews({ client: clientName });
    
    // Format response with the status
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Status for ${clientName}`,
          emoji: false
        }
      }
    ];
    
    // Tasks section
    if (tasks.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Tasks (${tasks.length}):*`
        }
      });
      
      // Group tasks by status
      const pendingTasks = tasks.filter(t => t.status !== 'completed');
      const completedTasks = tasks.filter(t => t.status === 'completed');
      
      if (pendingTasks.length > 0) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Pending Tasks:*\n${pendingTasks.map(t => `• ${t.title} - Assigned to <@${t.assignee || t.assigneeId}> (${t.assigneeName || 'Unknown'})`).join('\n')}`
          }
        });
      }
      
      if (completedTasks.length > 0) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Completed Tasks:*\n${completedTasks.slice(0, 5).map(t => `• ${t.title}`).join('\n')}${completedTasks.length > 5 ? `\n_and ${completedTasks.length - 5} more..._` : ''}`
          }
        });
      }
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*No tasks found for this client.*"
        }
      });
    }
    
    // Reviews section
    if (reviews.length > 0) {
      blocks.push({
        type: "divider"
      });
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Content Reviews (${reviews.length}):*`
        }
      });
      
      // Group reviews by status
      const reviewsByStatus = {};
      reviews.forEach(review => {
        if (!reviewsByStatus[review.status]) {
          reviewsByStatus[review.status] = [];
        }
        reviewsByStatus[review.status].push(review);
      });
      
      for (const [status, statusReviews] of Object.entries(reviewsByStatus)) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${reviewService.formatStatus(status)}:*\n${statusReviews.map(r => `• ${r.title}`).join('\n')}`
          }
        });
      }
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*No reviews found for this client.*"
        }
      });
    }
    
    await respond({
      blocks,
      text: `Status report for ${clientName}`,
      response_type: 'in_channel' // Make visible to everyone in the channel
    });
    
  } catch (error) {
    logger.error('Error handling status check:', error);
    await respond({
      text: `Sorry, I couldn't retrieve the status: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

module.exports = {
  handleAiCommand
};
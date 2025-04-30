// services/reviewService.js
const { formatDate } = require('../utils/formatters');

let prisma;

function init(prismaClient) {
  prisma = prismaClient;
}

// Helper function to ensure the bot can post to a channel
async function ensureBotInChannel(channelId, client) {
  try {
    // First check if this is a DM channel (starts with D)
    if (channelId.startsWith('D')) {
      return true; // We can always post to DMs
    }
    
    // For public/private channels, try to join
    if (channelId.startsWith('C') || channelId.startsWith('G')) {
      try {
        // Try to join the channel (works for public channels)
        await client.conversations.join({
          channel: channelId
        });
        console.log(`Joined channel ${channelId}`);
      } catch (error) {
        console.log(`Could not join channel ${channelId}, will try posting anyway: ${error.message}`);
        // Continue anyway - we might have permissions to post without joining
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error ensuring bot in channel ${channelId}:`, error);
    return false;
  }
}

// Extract client from a channel mention
async function extractClientFromChannel(channelMention, client) {
  if (!channelMention || !channelMention.startsWith('#')) {
    return null;
  }
  
  // Extract channel name or ID
  let channelId;
  let channelName = null;
  if (channelMention.startsWith('#C')) {
    // It's a channel ID
    channelId = channelMention.substring(1);
  } else {
    // It's a channel name, need to look up the ID
    try {
      const result = await client.conversations.list();
      const channel = result.channels.find(c => c.name === channelMention.substring(1));
      if (channel) {
        channelId = channel.id;
        channelName = channel.name;
      } else {
        return channelMention.substring(1);
      }
    } catch (error) {
      console.error('Error looking up channel:', error);
      return channelMention.substring(1);
    }
  }
  
  // Try to get channel info to extract purpose (which might contain client name)
  try {
    const info = await client.conversations.info({ channel: channelId });
    channelName = info.channel.name;
    
    if (info.channel.purpose && info.channel.purpose.value) {
      // Try to extract client name from purpose
      const purpose = info.channel.purpose.value.toLowerCase();
      const clientMatch = purpose.match(/client:\s*([^,]+)/i);
      if (clientMatch && clientMatch[1]) {
        return {
          client: clientMatch[1].trim(),
          channelName: channelName
        };
      }
    }
    
    // If no client found in purpose, check if channel name starts with "client-"
    if (info.channel.name.startsWith('client-')) {
      return {
        client: info.channel.name.substring(7), // Remove "client-" prefix
        channelName: channelName
      };
    }
    
    // Otherwise, just use the channel name
    return {
      client: info.channel.name,
      channelName: channelName
    };
  } catch (error) {
    console.error('Error getting channel info:', error);
    return {
      client: channelMention.substring(1), // Just use the channel name without #
      channelName: channelName || channelMention.substring(1)
    };
  }
}

// Create a new review request
async function createReview(title, description, creatorId, creatorName, reviewerIds, reviewerNames, channel, channelName, client, url = null, deadline = null, initialStatus = "in_review") {
  console.log(`Creating review: title=${title}, creator=${creatorId}, reviewers=${reviewerIds.join(',')}, client=${client}, initialStatus=${initialStatus}`);
  
  // Validate status
  const validStatuses = ["draft", "design", "in_review", "approved", "published"];
  if (!validStatuses.includes(initialStatus)) {
    initialStatus = "in_review"; // Default to in_review if invalid
  }
  
  // Calculate deadline if not provided (default to 3 days)
  let reviewDeadline = null;
  if (deadline) {
    reviewDeadline = new Date(deadline);
    
    // Set time to end of workday if not specified
    if (deadline.length <= 10) { // YYYY-MM-DD format
      reviewDeadline.setHours(17, 0, 0, 0);
    }
  } else {
    reviewDeadline = new Date();
    reviewDeadline.setDate(reviewDeadline.getDate() + 3);
    reviewDeadline.setHours(17, 0, 0, 0);
  }
  
  try {
    // Create review in database
    const review = await prisma.review.create({
      data: {
        reviewId: 'review_' + Date.now().toString(),
        title,
        description,
        creatorId,
        creatorName,
        reviewerIds,
        reviewerNames,
        channel,
        channelName,
        client,
        url,
        status: initialStatus,
        createdAt: new Date(),
        deadline: reviewDeadline
      }
    });
    
    console.log('Review created successfully:', review);
    return review;
  } catch (error) {
    console.error('Error creating review in database:', error);
    throw error;
  }
}

// Get reviews for a client or channel with various filters
async function getReviews(filters = {}) {
  console.log('Getting reviews with filters:', filters);
  const where = {};
  
  // Apply filters
  if (filters.client) {
    where.client = filters.client;
  }
  if (filters.channel) {
    where.channel = filters.channel;
  }
  if (filters.creatorId) {
    where.creatorId = filters.creatorId;
  }
  if (filters.reviewerId) {
    where.reviewerIds = {
      has: filters.reviewerId
    };
  }
  if (filters.status) {
    where.status = filters.status;
  }
  
  // Date-based filters for reports
  if (filters.activitySince) {
    const activityDate = new Date(filters.activitySince);
    
    // Find reviews created or completed since the given date, or with feedback since that date
    where.OR = [
      { createdAt: { gte: activityDate } },
      { completedAt: { gte: activityDate } }
    ];
    
    // Note: We'll need to filter feedbacks after the query since Prisma doesn't support
    // filtering on nested relations with OR conditions easily
  }
  
  try {
    const reviews = await prisma.review.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' }
      ],
      include: {
        feedbacks: true
      }
    });
    
    // Additional filtering for activity date on feedbacks if needed
    if (filters.activitySince) {
      const activityDate = new Date(filters.activitySince);
      
      // Also include reviews that have feedback activity since the date
      const reviewsWithRecentFeedback = [];
      
      // Find all reviews to check their feedback dates
      const allReviews = await prisma.review.findMany({
        include: {
          feedbacks: true
        }
      });
      
      // Check each review for feedback activity
      allReviews.forEach(review => {
        // Check if any feedback was given after the activity date
        const hasRecentFeedback = review.feedbacks.some(
          feedback => new Date(feedback.createdAt) >= activityDate
        );
        
        if (hasRecentFeedback) {
          reviewsWithRecentFeedback.push(review.id);
        }
      });
      
      // Add reviews with recent feedback to our results if not already included
      if (reviewsWithRecentFeedback.length > 0) {
        const additionalReviews = await prisma.review.findMany({
          where: {
            id: { in: reviewsWithRecentFeedback },
            // Exclude reviews we already have
            NOT: { 
              OR: [
                { createdAt: { gte: activityDate } },
                { completedAt: { gte: activityDate } }
              ]
            }
          },
          include: {
            feedbacks: true
          }
        });
        
        // Combine the results
        reviews.push(...additionalReviews);
      }
    }
    
    console.log(`Found ${reviews.length} reviews matching filters`);
    return reviews;
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return [];
  }
}

// Get a single review by ID or title
async function getReviewById(reviewId) {
  try {
    const review = await prisma.review.findUnique({
      where: {
        reviewId
      },
      include: {
        feedbacks: true
      }
    });
    
    return review;
  } catch (error) {
    console.error(`Error finding review by ID ${reviewId}:`, error);
    return null;
  }
}

// Add feedback to a review
async function addFeedback(reviewId, reviewerId, reviewerName, comment, status, client = null) {
  console.log(`Adding feedback to review ${reviewId} from ${reviewerId} (${reviewerName}): ${status}`);
  
  try {
    const review = await getReviewById(reviewId);
    
    if (!review) {
      return {
        success: false,
        message: "Review not found"
      };
    }
    
    // Check if reviewer is authorized
    if (!review.reviewerIds.includes(reviewerId)) {
      return {
        success: false,
        message: "You are not authorized to review this item"
      };
    }
    
    // Add feedback
    await prisma.feedback.create({
      data: {
        reviewId: review.id,
        reviewerId,
        reviewerName,
        comment,
        status,
        createdAt: new Date()
      }
    });
    
    // Update review status if all reviewers have approved
    const updatedReview = await updateReviewStatus(review.id, client);
    
    // Try to notify the channel if client is provided
    if (client && review.channel) {
      try {
        await ensureBotInChannel(review.channel, client);
      } catch (error) {
        console.error(`Error ensuring channel access for notification: ${error.message}`);
        // Continue anyway
      }
    }
    
    return {
      success: true,
      review: updatedReview
    };
  } catch (error) {
    console.error(`Error adding feedback: ${error}`);
    return {
      success: false,
      message: `Error adding feedback: ${error.message}`
    };
  }
}

// Approve a review directly (shorthand for positive feedback)
// Fix for the approveReview function in reviewService.js

async function approveReview(reviewId, reviewerId, reviewerName, comment = "Approved", client = null) {
  console.log(`Approving review ${reviewId} by ${reviewerId} (${reviewerName})`);
  
  try {
    const review = await getReviewById(reviewId);
    
    if (!review) {
      return {
        success: false,
        message: "Review not found"
      };
    }
    
    // Add the feedback - FIXED to ensure comment is a string
    await prisma.feedback.create({
      data: {
        reviewId: review.id,
        reviewerId,
        reviewerName,
        // Make sure comment is a string
        comment: typeof comment === 'string' ? comment : "Approved",
        status: "approved",
        createdAt: new Date()
      }
    });
    
    // Update the review status - now passing the client so we can send notifications
    const updatedReview = await updateReviewStatus(review.id, client);
    
    if (!updatedReview) {
      return {
        success: false,
        message: "Error updating review status after approval"
      };
    }
    
    // If the review is not in a completed state yet, notify the creator
    if (updatedReview.status !== "approved" && updatedReview.status !== "published" && client) {
      // Notify the creator if different from reviewer
      if (updatedReview.creatorId !== reviewerId) {
        try {
          await client.chat.postMessage({
            channel: updatedReview.creatorId,
            blocks: formatReviewStatusUpdate(updatedReview, reviewerId, reviewerName),
            text: `<@${reviewerId}> approved your content "${updatedReview.title}"`
          });
        } catch (error) {
          console.error(`Error sending approval notification to creator: ${error.message}`);
        }
      }
    }
    
    return {
      success: true,
      review: updatedReview
    };
  } catch (error) {
    console.error(`Error approving review: ${error}`);
    return {
      success: false,
      message: `Error approving review: ${error.message}`
    };
  }
}

// Update a review's status based on feedback and send notifications
async function updateReviewStatus(reviewId, client = null) {
  try {
    // Get the review with all feedback
    const review = await prisma.review.findUnique({
      where: {
        id: reviewId
      },
      include: {
        feedbacks: true
      }
    });
    
    if (!review) {
      return null;
    }
    
    // Get the most recent feedback from each reviewer
    const reviewerFeedback = {};
    review.feedbacks.forEach(feedback => {
      if (!reviewerFeedback[feedback.reviewerId] || 
          new Date(feedback.createdAt) > new Date(reviewerFeedback[feedback.reviewerId].createdAt)) {
        reviewerFeedback[feedback.reviewerId] = feedback;
      }
    });
    
    // Check if all reviewers have approved
    const allApproved = review.reviewerIds.every(reviewerId => {
      return reviewerFeedback[reviewerId] && reviewerFeedback[reviewerId].status === "approved";
    });
    
    // Update status if necessary
    let newStatus = review.status;
    let statusChanged = false;
    
    if (allApproved && review.status === "in_review") {
      newStatus = "approved";
      statusChanged = true;
    } else if (Object.values(reviewerFeedback).some(f => f.status === "requested_changes")) {
      newStatus = "in_review";
      statusChanged = true;
    }
    
    let updatedReview = review;
    
    // Update if status changed
    if (statusChanged) {
      console.log(`Review ${review.reviewId} status changing from ${review.status} to ${newStatus}`);
      
      updatedReview = await prisma.review.update({
        where: {
          id: review.id
        },
        data: {
          status: newStatus,
          ...(newStatus === "approved" ? { completedAt: new Date() } : {})
        },
        include: {
          feedbacks: true
        }
      });
      
      // If review is now approved and client object is provided, send a channel notification
      if (newStatus === "approved" && client) {
        try {
          // Make sure bot can post to the channel
          await ensureBotInChannel(review.channel, client);
          
          // Get the last reviewer who approved
          const lastApprover = review.feedbacks
            .filter(f => f.status === "approved")
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || {};
          
          const lastApproverId = lastApprover.reviewerId || "Unknown";
          const lastApproverName = lastApprover.reviewerName || "Unknown User";
          
          // Send notification to the channel
          await client.chat.postMessage({
            channel: review.channel,
            blocks: formatReviewCompletionNotification(updatedReview, lastApproverId, lastApproverName),
            text: `Review for "${updatedReview.title}" is now complete and approved!`
          });
          
          console.log(`Sent completion notification to channel ${review.channel} for review ${review.reviewId}`);
        } catch (error) {
          console.error(`Error sending channel notification for review completion: ${error.message}`);
        }
      }
    } else {
      // Return the updated review with feedbacks
      updatedReview = await prisma.review.findUnique({
        where: {
          id: review.id
        },
        include: {
          feedbacks: true
        }
      });
    }
    
    return updatedReview;
  } catch (error) {
    console.error(`Error updating review status: ${error}`);
    return null;
  }
}

// Update review status manually and send completion notification if appropriate
async function updateReviewStatusManually(reviewId, newStatus, userId, userName, client = null) {
  console.log(`Manually updating review ${reviewId} to status ${newStatus} by ${userId} (${userName})`);
  
  try {
    const review = await getReviewById(reviewId);
    
    if (!review) {
      return {
        success: false,
        message: "Review not found"
      };
    }
    
    // Check if user is authorized (creator or reviewer)
    if (review.creatorId !== userId && !review.reviewerIds.includes(userId)) {
      return {
        success: false,
        message: "You are not authorized to update this review"
      };
    }
    
    // Validate status
    const validStatuses = ["draft", "design", "in_review", "approved", "published"];
    if (!validStatuses.includes(newStatus)) {
      return {
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      };
    }
    
    // Check if this is a completion status (approved or published)
    const isCompletionStatus = newStatus === "approved" || newStatus === "published";
    const wasCompleted = review.status === "approved" || review.status === "published";
    const isNewCompletion = isCompletionStatus && !wasCompleted;
    
    // Try to ensure channel access if client is provided
    if (client && review.channel) {
      try {
        await ensureBotInChannel(review.channel, client);
      } catch (error) {
        console.error(`Error ensuring channel access: ${error.message}`);
      }
    }
    
    // Update the status
    const updatedReview = await prisma.review.update({
      where: {
        reviewId
      },
      data: {
        status: newStatus,
        ...(isCompletionStatus ? { completedAt: new Date() } : {})
      },
      include: {
        feedbacks: true
      }
    });
    
    // Send completion notification to channel if this is a new completion
    if (isNewCompletion && client && updatedReview.channel) {
      try {
        await client.chat.postMessage({
          channel: updatedReview.channel,
          blocks: formatReviewCompletionNotification(updatedReview, userId, userName),
          text: `Review for "${updatedReview.title}" is now complete and ${newStatus}!`
        });
        
        console.log(`Sent completion notification to channel ${updatedReview.channel} for manually completed review ${reviewId}`);
      } catch (error) {
        console.error(`Error sending manual completion notification: ${error.message}`);
        // Continue anyway - we don't want to fail just because notification failed
      }
    }
    
    return {
      success: true,
      review: updatedReview
    };
  } catch (error) {
    console.error(`Error updating review status: ${error}`);
    return {
      success: false,
      message: `Error updating review: ${error.message}`
    };
  }
}

// Format review request notification
function formatReviewRequestMessage(review) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Review Request",
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${review.title}*${review.description ? `\n${review.description}` : ''}`
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Client:*\n${review.client}`
        },
        {
          type: "mrkdwn",
          text: `*Status:*\n${formatStatus(review.status)}`
        },
        {
          type: "mrkdwn",
          text: `*Created by:*\n<@${review.creatorId}> (${review.creatorName})`
        },
        {
          type: "mrkdwn",
          text: `*Due:*\n${review.deadline ? formatDate(review.deadline) : 'Not specified'}`
        }
      ]
    }
  ];
  
  // Add URL if present
  if (review.url) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Link:* <${review.url}|View Content>`
      }
    });
  }
  
  // Add reviewers section
  const reviewerMentions = review.reviewerIds.map((id, index) => 
    `<@${id}> (${review.reviewerNames[index] || 'Unknown'})`
  ).join(', ');
  
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Reviewers:* ${reviewerMentions}`
    }
  });
  
  return blocks;
}

// Format review notification for a reviewer
function formatReviewNotification(review) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "New Review Request",
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${review.title}*${review.description ? `\n${review.description}` : ''}`
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Client:*\n${review.client}`
        },
        {
          type: "mrkdwn",
          text: `*Due:*\n${review.deadline ? formatDate(review.deadline) : 'Not specified'}`
        }
      ]
    }
  ];
  
  // Add URL if present
  if (review.url) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Link:* <${review.url}|View Content>`
      }
    });
  }
  
  // Add action buttons
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Approve",
          emoji: false
        },
        value: review.reviewId,
        action_id: "approve_review",
        style: "primary"
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Request Changes",
          emoji: false
        },
        value: review.reviewId,
        action_id: "request_changes"
      }
    ]
  });
  
  // Add context
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Requested by <@${review.creatorId}> (${review.creatorName}) in <#${review.channel}>`
      }
    ]
  });
  
  return blocks;
}

// Format feedback message
function formatReviewFeedbackMessage(review, userId, userName, status) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: status === "approved" ? "Review Approved" : "Feedback Provided",
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${review.title}*`
      }
    }
  ];
  
  // Add the feedback that was just given
  const feedback = review.feedbacks.find(f => 
    f.reviewerId === userId && 
    (status === "approved" ? f.status === "approved" : f.status === "requested_changes")
  );
  
  if (feedback) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Your feedback:*\n${feedback.comment}`
      }
    });
  }
  
  // Add context
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Feedback submitted for ${review.client}'s "${review.title}"`
      }
    ]
  });
  
  return blocks;
}

// Format a notification about feedback to send to the creator/channel
function formatReviewFeedbackNotification(review, reviewerId, reviewerName, feedback) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Review Feedback Received",
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${review.title}*\n<@${reviewerId}> (${reviewerName}) has requested changes:`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: feedback
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Current status: ${formatStatus(review.status)}`
        }
      ]
    }
  ];
  
  return blocks;
}

// Format a notification about review status update
function formatReviewStatusUpdate(review, userId, userName) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Review ${formatStatus(review.status)}`,
        emoji: false
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${review.title}*\nThe review has been ${review.status.toLowerCase()} by <@${userId}> (${userName}).`
      }
    }
  ];
  
  // Add URL if present
  if (review.url) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Link:* <${review.url}|View Content>`
      }
    });
  }
  
  // Add all reviewer statuses
  const reviewerStatuses = [];
  review.reviewerIds.forEach((reviewer, index) => {
    // Find most recent feedback from this reviewer
    const feedback = review.feedbacks
      .filter(f => f.reviewerId === reviewer)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    
    let status = "Pending";
    if (feedback) {
      status = feedback.status === "approved" ? "✅ Approved" : "⚠️ Requested Changes";
    }
    
    reviewerStatuses.push(`<@${reviewer}> (${review.reviewerNames[index] || 'Unknown'}): ${status}`);
  });
  
  if (reviewerStatuses.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Reviewer Status:*\n${reviewerStatuses.join('\n')}`
      }
    });
  }
  
  return blocks;
}

// Format review completion notification
function formatReviewCompletionNotification(review, approverId, approverName) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🎉 Review Approved & Completed",
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${review.title}* has been fully reviewed and approved!`
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Client:*\n${review.client}`
        },
        {
          type: "mrkdwn",
          text: `*Status:*\n${formatStatus(review.status)}`
        }
      ]
    }
  ];
  
  // Add URL if present
  if (review.url) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Link:* <${review.url}|View Content>`
      }
    });
  }
  
  // Add reviewer information
  const allReviewers = review.reviewerIds.map((id, index) => 
    `<@${id}> (${review.reviewerNames[index] || 'Unknown'})`
  ).join(', ');
  
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Reviewers:* ${allReviewers}`
    }
  });
  
  // Add final approver context
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Final approval by <@${approverId}> (${approverName}) | Created by <@${review.creatorId}> (${review.creatorName})`
      }
    ]
  });
  
  return blocks;
}

// Format client status list
function formatClientStatus(client, reviews) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Status for ${client}`,
        emoji: false
      }
    }
  ];
  
  if (reviews.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No active content items found for this client."
      }
    });
    return blocks;
  }
  
  // Group by status
  const statusGroups = {
    "draft": [],
    "design": [],
    "in_review": [],
    "approved": [],
    "published": []
  };
  
  reviews.forEach(review => {
    if (statusGroups[review.status]) {
      statusGroups[review.status].push(review);
    } else {
      if (!statusGroups.other) statusGroups.other = [];
      statusGroups.other.push(review);
    }
  });
  
  // Add each status section
  const statuses = ["draft", "design", "in_review", "approved", "published", "other"];
  
  statuses.forEach(status => {
    if (statusGroups[status] && statusGroups[status].length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${formatStatus(status)}:*`
        }
      });
      
      statusGroups[status].forEach(review => {
        const reviewerCount = review.reviewerIds.length;
        const approvalCount = review.feedbacks
          .filter(f => f.status === "approved")
          .map(f => f.reviewerId)
          .filter((reviewer, index, self) => self.indexOf(reviewer) === index)
          .length;
          
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `• *${review.title}*\n   Created by <@${review.creatorId}> (${review.creatorName}) | ${approvalCount}/${reviewerCount} approvals`
          }
        });
      });
    }
  });
  
  return blocks;
}
  
// Helper function to format status string
function formatStatus(status) {
  switch (status) {
    case 'draft':
      return '📝 Draft';
    case 'design':
      return '🎨 Design';
    case 'in_review':
      return '👀 In Review';
    case 'approved':
      return '✅ Approved';
    case 'published':
      return '🚀 Published';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

module.exports = {
  init,
  extractClientFromChannel,
  createReview,
  getReviews,
  getReviewById,
  addFeedback,
  approveReview,
  updateReviewStatus,
  updateReviewStatusManually,
  formatReviewRequestMessage,
  formatReviewNotification,
  formatReviewFeedbackMessage,
  formatReviewFeedbackNotification,
  formatReviewStatusUpdate,
  formatClientStatus,
  formatStatus,
  ensureBotInChannel
};
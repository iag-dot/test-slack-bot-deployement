// utils/parsers.js

// Extract user ID from different mention formats
function extractUserId(text) {
    // Different patterns:
    // <@U12345|username> - Slack's normal mention format
    // <@U12345> - Slack's userID-only mention format
    // @U12345 - Manual format some users might use
    // @username - Just a username with @ prefix
  
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
    
    // If it's just a username like @rishabh, we need to look up the ID
    if (cleanedText.startsWith('@')) {
      // Return with special prefix that will signal need for lookup
      return 'USERNAME:' + cleanedText.substring(1);
    }
    
    return cleanedText;
  }
  
  // Parse arguments for assign command
  function parseAssignArgs(text) {
    const result = {
      userId: null,
      title: '',
      description: '',
      team: null,
      priority: null,
      deadline: null,
      client: null,
      urgent: false
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
        result.urgent = true;
        result.priority = 'urgent';
      } else if (arg.startsWith('-team=')) {
        result.team = arg.substring(6).toLowerCase();
      } else if (arg.startsWith('-priority=')) {
        result.priority = arg.substring(10).toLowerCase();
      } else if (arg.startsWith('-deadline=')) {
        result.deadline = arg.substring(10);
      } else if (arg.startsWith('-client=')) {
        result.client = arg.substring(8);
      } else if (result.userId && !result.title) {
        // If we have user ID but no title yet, this is the title
        result.title = arg;
      } else if (result.title) {
        // If we already have a title, add to description
        if (result.description.length > 0) {
          result.description += ' ';
        }
        result.description += arg;
      }
    }
    
    return result;
  }
  
  // Parse arguments for review command
  function parseReviewArgs(text) {
    const result = {
      title: '',
      description: '',
      reviewers: [],
      channelMention: null,
      client: null,
      url: null,
      deadline: null,
      status: null
    };
    
    // Split by spaces but preserve quoted text
    const matches = text.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    
    // Variables to track parsing state
    let foundTitle = false;
    
    // Process arguments
    for (let i = 0; i < matches.length; i++) {
      const arg = matches[i].replace(/"/g, ''); // Remove quotes
      
      if (arg.startsWith('-r=')) {
        // Legacy format support: Parse reviewers with -r= prefix
        const reviewerText = arg.substring(3);
        const reviewerMatches = reviewerText.match(/@\S+/g) || [];
        result.reviewers = reviewerMatches.map(m => extractUserId(m));
      } else if (arg.startsWith('@')) {
        // Direct tagging - add to reviewers list
        result.reviewers.push(extractUserId(arg));
      } else if (arg.startsWith('-url=')) {
        result.url = arg.substring(5);
      } else if (arg.startsWith('-deadline=')) {
        result.deadline = arg.substring(10);
      } else if (arg.startsWith('-client=')) {
        result.client = arg.substring(8);
      } else if (arg.startsWith('-status=')) {
        // Added support for initial status
        result.status = arg.substring(8).toLowerCase();
      } else if (arg.startsWith('#')) {
        // Channel mention
        result.channelMention = arg;
      } else if (!foundTitle) {
        // First non-option argument is the title
        result.title = arg;
        foundTitle = true;
      } else {
        // Additional text goes to description
        if (result.description.length > 0) {
          result.description += ' ';
        }
        result.description += arg;
      }
    }
    
    return result;
  }
  
  module.exports = {
    extractUserId,
    parseAssignArgs,
    parseReviewArgs
  };
// commands/help.js
const { formatHelpMessage } = require('../utils/formatters');

async function handleHelpCommand({ command, respond, logger, isDM = false }) {
  logger.info('Processing /inagiffyhelp command:', command);
  
  try {
    // Generate the comprehensive help message
    const blocks = formatHelpMessage();
    
    // Respond with the help message
    await respond({
      blocks,
      text: "Inagiffy Bot - Help Guide",
      response_type: "ephemeral" // Only visible to the user who triggered it
    });
    
    logger.info('Sent help response to user:', command.user_id);
  } catch (error) {
    logger.error('Error in help command:', error);
    
    await respond({
      text: `Error displaying help: ${error.message}`,
      response_type: "ephemeral"
    });
  }
}

module.exports = {
  handleHelpCommand
};
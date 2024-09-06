import { ApplicationCommandOptionType, User } from 'discord.js';
import { Command } from '../../structures/Command';
import { actionUserGlobal } from '../../utils/actioning/actionUserGlobal';
import db from '../../utils/database';
import { sendError, sendSuccess } from '../../utils/messages';
import axios from 'axios';
import rateLimit from 'axios-rate-limit';

const limiter = rateLimit({
  maxRequests: 10, // Adjust the rate limit as needed
  perMilliseconds: 60 * 1000,
});

const client = axios.create({
  baseURL: 'https://discord.com/api/v10',
  headers: {
    Authorization: `Bot ${yourBotToken}`,
  },
});

client.interceptors.request.use(limiter);

/**
 * Command to force check a user globally, with rate limiting.
 */
export default new Command({
  name: 'forcecheck',
  description: 'Globally check a user',
  main: true,
  defaultMemberPermissions: 'Administrator',
  options: [
    {
      type: ApplicationCommandOptionType.User,
      name: 'user',
      description: 'User or ID',
      required: true,
    },
  ],
  run: async ({ interaction, client }) => {
    // Get the user ID from the interaction
    const user = interaction.options.getUser('user') as User;
    if (!user) {
      return sendError(interaction, 'Invalid user or ID provided.');
    }

    // Fetch user data from the database
    const userData = await db.getUser(user.id);
    if (!userData) {
      return sendError(interaction, 'User not found in database.');
    }

    // Check if the user is whitelisted, appealed, or a bot
    if (userData.status === 'WHITELISTED') {
      return sendError(interaction, 'You cannot action a whitelisted user.');
    }
    if (userData.status === 'APPEALED') {
      return sendError(interaction, 'You cannot action an appealed user.');
    }
    if (userData.type === 'BOT') {
      return sendError(interaction, 'You cannot action a bot user.');
    }

    // Inform the user of the force check request
    sendSuccess(interaction, 'Requested force check on all shards');

    // Perform the global action on the user with rate limiting
    try {
      await actionUserGlobal(client, user.id);
      sendSuccess(interaction, 'Force check successfully completed');
    } catch (error) {
      if (error.response && error.response.status === 429) {
        // Handle rate limit error
        sendError(interaction, 'Rate limit exceeded. Please try again later.');
      } else {
        sendError(interaction, `An error occurred while performing the force check: ${error.message}`);
      }
    }

    return false;
  },
});

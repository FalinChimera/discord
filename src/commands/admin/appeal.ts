import { UserStatus } from '@prisma/client';
import { BaseCommandInteraction, Snowflake } from 'discord.js';
import { Colours, LogTypes } from '../../@types';
import { Bot, SlashCommand } from '../../classes';
import { sendEmbed } from '../../utils/messages';
import { updateStatus } from '../../utils/users';

export default class AppealCommand extends SlashCommand {
    constructor(client: Bot) {
        super({
            client,
            name: 'appeal',
            description: 'appeal',
            type: 'CHAT_INPUT',
            options: [
                {
                    type: 3,
                    name: 'userid',
                    description: 'User ID to appeal',
                    required: false,
                },
                {
                    type: 6,
                    name: 'user',
                    description: 'User to appeal',
                    required: false,
                },
            ],
            defaultPermission: true,
            staffRole: 'admin',
        });
    }

    public async run(client: Bot, interaction: BaseCommandInteraction): Promise<boolean> {
        if (client.processing.isProcessing()) {
            client.processing.disabledMessage(interaction);
            return false;
        }

        const id = (interaction.options.getUser('user')?.id ||
            interaction.options.get('userid')?.value) as Snowflake;

        if (!id) {
            sendEmbed({
                interaction,
                embed: {
                    description: 'You must provided either a user or user id',
                    color: Colours.YELLOW,
                },
            });
            return false;
        }
        const date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

        const info = {
            id,
            reason: `Appealed ${date} - ${interaction.user.username}`,
            status: UserStatus.APPEALED,
        };

        updateStatus({ client, ...info })
            .then(async updated => {
                sendEmbed({
                    interaction,
                    embed: {
                        description: `Updated ${updated.last_username} (${info.id}) to status \`${info.status}\`, with reason: \`${info.reason}\``,
                        color: Colours.GREEN,
                    },
                });
                client.emit('logAction', {
                    type: LogTypes.APPEALED,
                    author: interaction.user,
                    message: `${interaction.user.username}#${interaction.user.discriminator} appealed ${updated.last_username} (${id})`,
                });

                await client.db.users.update({
                    where: {
                        id,
                    },
                    data: {
                        appeals: {
                            increment: 1,
                        },
                    },
                });

                const abGuilds = await client.db.guild.findMany({
                    where: {
                        appealunban: {
                            equals: true,
                        },
                    },
                });
                await abGuilds.reduce(async (a, guild) => {
                    await a;
                    client.guilds
                        .fetch(guild.id)
                        .then(g => {
                            g.bans
                                .fetch(id)
                                .then(b => {
                                    if (b.reason.includes('Warden')) {
                                        g.bans
                                            .remove(id)
                                            .then(() =>
                                                client.logger.debug(
                                                    `apeal ${id}: ${guild.name} - Unbanned`
                                                )
                                            )
                                            .catch(() =>
                                                client.logger.warn(
                                                    `appeal ${id}: ${guild.name} - Unable to unban`
                                                )
                                            );
                                    }
                                })
                                .catch(() =>
                                    client.logger.debug(`appeal ${id}: ${guild.name} - Not banned`)
                                );
                        })
                        .catch(() => client.logger.warn(`appeal ${id}: Bot not in guild ${guild.id}`));
                    await new Promise(resolve => setTimeout(resolve, 100));
                }, Promise.resolve());

                client.logger.debug(`appeal ${id}: Finished`);
            })
            .catch(e => {
                console.log(e);
            });

        return true;
    }
}

const { Client, GatewayIntentBits, EmbedBuilder, Options } = require('discord.js');
require('dotenv').config();
const Jail = require('../models/Jail');
const Rejected = require('../models/Rejected');
const Mute = require('../models/Mute');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    // RAM Optimization: Limit internal caching to stay within 500MB
    makeCache: Options.cacheWithLimits({
        MessageManager: 0, // Don't cache messages in RAM
        PresenceManager: 0, // Don't cache user status
        GuildMemberManager: {
            maxSize: 100, // Only keep 100 recent members in memory
            keepOverLimit: (member) => member.id === client.user?.id,
        },
        UserManager: 100, // Limit user objects
        VoiceStateManager: 200, // Limit voice state cache
        ReactionManager: 0,
        ThreadManager: 0
    })
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Sticky Punishments: Reapply Jail, Reject, and Mute when a user rejoins
client.on('guildMemberAdd', async (member) => {
    try {
        // 1. Check if user is actively rejected
        const rejectedEntry = await Rejected.findOne({ userId: member.id, isActive: true });
        if (rejectedEntry) {
            const rejectedRole = member.guild.roles.cache.find(r => r.name.toLowerCase() === 'rejected');
            if (rejectedRole) {
                // Remove all other roles (like autoroles) and set only Rejected
                await member.roles.set([rejectedRole.id]).catch(console.error);
            }
        }

        // 2. Check if user is actively jailed
        const jailEntry = await Jail.findOne({ userId: member.id, isActive: true });
        if (jailEntry) {
            if (jailEntry.expiresAt > new Date()) {
                const jailedRole = member.guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
                if (jailedRole) {
                    // Remove all other roles and set only Jailed
                    await member.roles.set([jailedRole.id]).catch(console.error);
                }
            }
        }

        // 3. Check if user is actively muted
        const muteEntry = await Mute.findOne({ userId: member.id, active: true });
        if (muteEntry) {
            const now = new Date();
            if (muteEntry.expiresAt > now) {
                const timeLeftMs = muteEntry.expiresAt.getTime() - now.getTime();
                await member.timeout(timeLeftMs, 'Mute evasion automatically reapplied').catch(console.error);
            } else {
                muteEntry.active = false;
                await muteEntry.save().catch(console.error);
            }
        }
    } catch (err) {
        console.error('Error in guildMemberAdd sticky punishments:', err);
    }
});

const getGuild = async () => {
    try {
        return await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    } catch (err) {
        console.error('Error fetching guild:', err);
        return null;
    }
};

const getStats = async () => {
    const guild = await getGuild();
    if (!guild) return null;
    const boosterRoleId = '1201907918845526046';
    const voiceMembersCount = guild.voiceStates.cache.size;
    let boosterCount = 0;
    try {
        const boosterRole = guild.roles.cache.get(boosterRoleId);
        if (boosterRole) boosterCount = boosterRole.members.size;
    } catch (err) {
        console.error('Error getting booster role stats:', err);
    }
    return {
        memberCount: guild.memberCount,
        roleCount: guild.roles.cache.size,
        channelCount: guild.channels.cache.size,
        boosterCount,
        voiceMembersCount,
        name: guild.name,
        icon: guild.iconURL()
    };
};

const getMembers = async () => {
    const guild = await getGuild();
    if (!guild) return [];
    const members = await guild.members.fetch();
    return members.map(m => ({
        id: m.id,
        username: m.user.username,
        displayName: m.displayName,
        avatar: m.user.displayAvatarURL(),
        roles: m.roles.cache.map(r => r.id)
    }));
};

const getRoles = async () => {
    const guild = await getGuild();
    if (!guild) return [];
    return guild.roles.cache.map(r => ({
        id: r.id,
        name: r.name,
        color: r.hexColor,
        position: r.position,
        permissions: r.permissions.bitfield.toString()
    })).sort((a, b) => b.position - a.position);
};

const getChannels = async () => {
    const guild = await getGuild();
    if (!guild) return [];
    // Return only text and announcement channels (type 0 and 5)
    return guild.channels.cache
        .filter(c => c.type === 0 || c.type === 5)
        .map(c => ({
            id: c.id,
            name: c.name,
            position: c.position
        })).sort((a, b) => a.position - b.position);
};

const jailMember = async (userId, reason, duration, durationUnit, moderatorName) => {
    const guild = await getGuild();
    if (!guild) return null;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { error: 'Member not found in server' };

    // Save current roles before jailing (exclude @everyone)
    const rolesBefore = member.roles.cache
        .filter(r => r.id !== guild.id)
        .map(r => r.id);

    // Find "Jailed" role
    let jailedRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
    if (!jailedRole) {
        return { error: 'Jailed role not found. Please create a role named "Jailed" first.' };
    }

    // Remove all roles and assign only the Jailed role
    await member.roles.set([jailedRole.id]);

    // Calculate expiry for DM display
    const unitLabels = { m: 'minutes', h: 'hours', d: 'days' };
    const durationLabel = `${duration} ${unitLabels[durationUnit] || durationUnit}`;

    // Send DM to the jailed member
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('🔒 Jailed')
            .setDescription(
                `You have been jailed in **${guild.name}**.\n\n` +
                `**Reason:** ${reason || 'No reason provided'}\n` +
                `**Duration:** ${durationLabel}\n\n` +
                `_Jailed by Wisdom Circle System_`
            )
            .setFooter({ text: 'Wisdom Circle ⭕ Management' })
            .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
    } catch (err) {
        console.warn(`Could not send DM to ${member.user.username}: ${err.message}`);
    }

    return {
        success: true,
        rolesBefore,
        username: member.user.username,
        displayName: member.displayName,
        avatar: member.user.displayAvatarURL()
    };
};

const unjailMember = async (userId, rolesBefore, moderatorName) => {
    const guild = await getGuild();
    if (!guild) return null;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { error: 'Member not found in server' };

    // Restore original roles
    if (rolesBefore && rolesBefore.length > 0) {
        const validRoles = rolesBefore.filter(rId => guild.roles.cache.has(rId));
        await member.roles.set(validRoles);
    } else {
        const jailedRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
        if (jailedRole) {
            await member.roles.remove(jailedRole);
        }
    }

    // Send DM to the unjailed member
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🔓 Released')
            .setDescription(
                `You have been released from jail in **${guild.name}**.\n` +
                `Your roles have been restored.\n\n` +
                `_Released by Wisdom Circle System_`
            )
            .setFooter({ text: 'Wisdom Circle ⭕ Management' })
            .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
    } catch (err) {
        console.warn(`Could not send DM to ${member.user.username}: ${err.message}`);
    }

    return { success: true };
};

// ═══════════════════════════════════════════
// REJECTED SYSTEM
// ═══════════════════════════════════════════

const rejectMember = async (userId, reason, moderatorName) => {
    const guild = await getGuild();
    if (!guild) return null;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { error: 'Member not found in server' };

    // Save current roles before rejecting (exclude @everyone)
    const rolesBefore = member.roles.cache
        .filter(r => r.id !== guild.id)
        .map(r => r.id);

    // Find or look for "Rejected" role
    let rejectedRole = guild.roles.cache.find(
        r => r.name.toLowerCase() === 'rejected'
    );

    if (!rejectedRole) {
        return { error: 'Rejected role not found. Please create a role named "Rejected" first.' };
    }

    // Remove all roles and assign only the Rejected role
    await member.roles.set([rejectedRole.id]);

    // Send DM to the rejected member
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('⛔ Rejected')
            .setDescription(
                `You have been rejected from **${guild.name}**.\n\n` +
                `**Reason:** ${reason || 'No reason provided'}\n\n` +
                `_Rejected by Wisdom Circle System_`
            )
            .setFooter({ text: 'Wisdom Circle ⭕ Management' })
            .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
    } catch (err) {
        console.warn(`Could not send DM to ${member.user.username}: ${err.message}`);
    }

    return {
        success: true,
        rolesBefore,
        username: member.user.username,
        displayName: member.displayName,
        avatar: member.user.displayAvatarURL()
    };
};

const unrejectMember = async (userId, rolesBefore, moderatorName) => {
    const guild = await getGuild();
    if (!guild) return null;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { error: 'Member not found in server' };

    // Restore original roles
    if (rolesBefore && rolesBefore.length > 0) {
        // Filter out any roles that no longer exist in the server
        const validRoles = rolesBefore.filter(rId => guild.roles.cache.has(rId));
        await member.roles.set(validRoles);
    } else {
        // Just remove the rejected role
        const rejectedRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'rejected');
        if (rejectedRole) {
            await member.roles.remove(rejectedRole);
        }
    }

    // Send DM to the unrejected member
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Accepted Back')
            .setDescription(
                `Your rejection from **${guild.name}** has been lifted.\n` +
                `Your roles have been restored.\n\n` +
                `_By Wisdom Circle System_`
            )
            .setFooter({ text: 'Wisdom Circle ⭕ Management' })
            .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
    } catch (err) {
        console.warn(`Could not send DM to ${member.user.username}: ${err.message}`);
    }

    return { success: true };
};

// ═══════════════════════════════════════════
// WARNING SYSTEM
// ═══════════════════════════════════════════

const warnMember = async (userId, reason, warnCount) => {
    const guild = await getGuild();
    if (!guild) return null;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { error: 'Member not found in server' };

    // Send DM to the warned member
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(0xFFFF00) // Yellow for warnings
            .setTitle('⚠️ Warning Received')
            .setDescription(
                `You have received a warning in **${guild.name}**.\n\n` +
                `**Reason:** ${reason || 'No reason provided'}\n` +
                `**Warning Count:** ${warnCount}\n\n` +
                `_Note: Reaching 5 warnings will result in automatic rejection._\n\n` +
                `_Warned by Wisdom Circle System_`
            )
            .setFooter({ text: 'Wisdom Circle ⭕ Management' })
            .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
    } catch (err) {
        console.warn(`Could not send DM to ${member.user.username}: ${err.message}`);
    }

    return {
        success: true,
        username: member.user.username,
        displayName: member.displayName,
        avatar: member.user.displayAvatarURL()
    };
};

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const sendAnnouncement = async (channelId, title, description, color, imageUrl, thumbnailUrl, footer, buttons = [], author = {}) => {
    const guild = await getGuild();
    if (!guild) return { error: 'Guild not found' };

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return { error: 'Invalid text channel or permissions' };

    const embed = new EmbedBuilder()
        .setTitle(title || null)
        .setDescription(description || null)
        .setColor(color ? parseInt(color.replace('#', '0x')) : 0x5865F2)
        .setTimestamp();

    if (imageUrl) embed.setImage(imageUrl);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    if (footer) embed.setFooter({ text: footer });
    else embed.setFooter({ text: 'Wisdom Circle ⭕ Management' });

    if (author && author.name) {
        embed.setAuthor({
            name: author.name,
            iconURL: author.icon || undefined,
            url: author.url || undefined
        });
    }

    const components = [];
    if (buttons && buttons.length > 0) {
        const row = new ActionRowBuilder();
        buttons.forEach(btn => {
            if (btn.label && btn.url) {
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel(btn.label)
                        .setURL(btn.url)
                        .setStyle(ButtonStyle.Link)
                );
            }
        });
        if (row.components.length > 0) components.push(row);
    }

    try {
        await channel.send({ embeds: [embed], components });
        return { success: true };
    } catch (err) {
        console.error('Error sending announcement:', err.message);
        return { error: 'Failed to send: ' + err.message };
    }
};

// ═══════════════════════════════════════════
// MODERATION (KICK/BAN) SYSTEM
// ═══════════════════════════════════════════

const kickMember = async (userId, reason, moderatorName) => {
    const guild = await getGuild();
    if (!guild) return null;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { error: 'Member not found in server' };

    // Send DM to the user before kicking
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('👢 Kicked')
            .setDescription(
                `You have been kicked from **${guild.name}**.\n\n` +
                `**Reason:** ${reason || 'No reason provided'}\n\n` +
                `_Kicked by Wisdom Circle System_`
            )
            .setFooter({ text: 'Wisdom Circle ⭕ Management' })
            .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
    } catch (err) {
        console.warn(`Could not send DM to ${member.user.username}: ${err.message}`);
    }

    // Perform Kick
    try {
        await member.kick(reason);
        return {
            success: true,
            username: member.user.username,
            displayName: member.displayName,
            avatar: member.user.displayAvatarURL()
        };
    } catch (err) {
        return { error: 'Failed to kick member. Ensure bot is above the member.' };
    }
};

const banMember = async (userId, reason, moderatorName) => {
    const guild = await getGuild();
    if (!guild) return null;

    const member = await guild.members.fetch(userId).catch(() => null);
    let username = userId;
    let avatar = undefined;

    if (member) {
        username = member.user.username;
        avatar = member.user.displayAvatarURL();

        // Send DM to the user before banning
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🔨 Banned')
                .setDescription(
                    `You have been banned from **${guild.name}**.\n\n` +
                    `**Reason:** ${reason || 'No reason provided'}\n\n` +
                    `_Banned by Wisdom Circle System_`
                )
                .setFooter({ text: 'Wisdom Circle ⭕ Management' })
                .setTimestamp();

            await member.send({ embeds: [dmEmbed] });
        } catch (err) {
            console.warn(`Could not send DM to ${member.user.username}: ${err.message}`);
        }
    }

    // Perform Ban
    try {
        await guild.members.ban(userId, { reason });
        return {
            success: true,
            username,
            avatar
        };
    } catch (err) {
        return { error: 'Failed to ban user. Ensure bot has permissions.' };
    }
};

const getBans = async () => {
    const guild = await getGuild();
    if (!guild) return [];

    try {
        const bans = await guild.bans.fetch();
        return bans.map(ban => ({
            userId: ban.user.id,
            username: ban.user.username,
            avatar: ban.user.displayAvatarURL(),
            reason: ban.reason || 'No reason provided'
        }));
    } catch (err) {
        console.error('Failed to fetch bans:', err);
        return [];
    }
};

const unbanMember = async (userId, reason, moderatorName) => {
    const guild = await getGuild();
    if (!guild) return null;

    try {
        const user = await client.users.fetch(userId);
        await guild.bans.remove(userId, reason);

        return {
            success: true,
            username: user.username,
            avatar: user.displayAvatarURL()
        };
    } catch (err) {
        return { error: 'Failed to unban user. They might not be banned.' };
    }
};

const muteMember = async (userId, reason, durationMinutes, moderatorName) => {
    const guild = await getGuild();
    if (!guild) return null;

    try {
        const member = await guild.members.fetch(userId);
        const durationMs = durationMinutes * 60 * 1000;

        await member.timeout(durationMs, reason);

        // DM User
        try {
            const embed = new EmbedBuilder()
                .setColor('#ffcc00')
                .setTitle('🔇 Muted')
                .setDescription(`You have been muted in **${guild.name}**.\n\n**Reason:** ${reason}\n**Duration:** ${durationMinutes} minutes`)
                .setTimestamp();
            await member.send({ embeds: [embed] });
        } catch (e) { }

        return {
            success: true,
            username: member.user.username,
            displayName: member.displayName,
            avatar: member.user.displayAvatarURL()
        };
    } catch (err) {
        return { error: 'Failed to mute member: ' + err.message };
    }
};

const changeNickname = async (userId, newNickname, moderatorName) => {
    const guild = await getGuild();
    if (!guild) return null;

    try {
        const member = await guild.members.fetch(userId);
        const oldNickname = member.displayName;
        await member.setNickname(newNickname);

        return {
            success: true,
            username: member.user.username,
            oldNickname,
            newNickname
        };
    } catch (err) {
        return { error: 'Failed to change nickname: ' + err.message };
    }
};

if (process.env.DISCORD_BOT_TOKEN) {
    client.login(process.env.DISCORD_BOT_TOKEN);
}

module.exports = { client, getStats, getMembers, getRoles, getChannels, getGuild, jailMember, unjailMember, rejectMember, unrejectMember, warnMember, sendAnnouncement, kickMember, banMember, getBans, unbanMember, muteMember, changeNickname };


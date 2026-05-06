const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { kickMember, banMember, getBans, unbanMember } = require('../services/discordBot');
const { ensureRoleAdmin } = require('../middleware/auth');
const { sendWebhookLog } = require('../utils/webhookLogger');

// @route   POST /api/moderation/kick
// @desc    Kick a member from the server
router.post('/kick', ensureRoleAdmin, async (req, res) => {
    const { userId, reason } = req.body;

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
    }

    try {
        const result = await kickMember(userId, reason || 'No reason provided', req.user.username);

        if (!result) {
            return res.status(500).json({ message: 'Failed to connect to Discord' });
        }
        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        // Log action
        await Log.create({
            action: 'Kick Member',
            category: 'Moderation',
            details: { reason },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId,
            targetName: result.username || userId
        });

        // Send Webhook Log
        await sendWebhookLog(
            process.env.MODERATION_WEBHOOK || process.env.SYSTEM_WEBHOOK,
            '👢 Member Kicked',
            0xFFA500, // Orange
            [
                { name: 'User', value: `${result.username} (<@${userId}>)`, inline: true },
                { name: 'Moderator', value: `<@${req.user.discordId}>`, inline: true },
                { name: 'Reason', value: reason || 'No reason provided', inline: false }
            ],
            result.avatar
        );

        res.json({ message: `${result.username} has been kicked successfully` });
    } catch (err) {
        console.error('Kick error:', err);
        res.status(500).json({ message: 'Error kicking member: ' + err.message });
    }
});

// @route   POST /api/moderation/ban
// @desc    Ban a member from the server
router.post('/ban', ensureRoleAdmin, async (req, res) => {
    const { userId, reason } = req.body;

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
    }

    try {
        const result = await banMember(userId, reason || 'No reason provided', req.user.username);

        if (!result) {
            return res.status(500).json({ message: 'Failed to connect to Discord' });
        }
        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        // Log action
        await Log.create({
            action: 'Ban Member',
            category: 'Moderation',
            details: { reason },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId,
            targetName: result.username || userId
        });

        // Send Webhook Log
        await sendWebhookLog(
            process.env.MODERATION_WEBHOOK || process.env.SYSTEM_WEBHOOK,
            '🔨 Member Banned',
            0xFF0000, // Red
            [
                { name: 'User', value: `${result.username} (<@${userId}>)`, inline: true },
                { name: 'Moderator', value: `<@${req.user.discordId}>`, inline: true },
                { name: 'Reason', value: reason || 'No reason provided', inline: false }
            ],
            result.avatar
        );

        res.json({ message: `${result.username} has been banned successfully` });
    } catch (err) {
        console.error('Ban error:', err);
        res.status(500).json({ message: 'Error banning member: ' + err.message });
    }
});

// @route   GET /api/moderation/bans
// @desc    Get all banned members
router.get('/bans', ensureRoleAdmin, async (req, res) => {
    try {
        const bans = await getBans();
        res.json(bans);
    } catch (err) {
        console.error('Fetch bans error:', err);
        res.status(500).json({ message: 'Error fetching bans' });
    }
});

// @route   POST /api/moderation/unban
// @desc    Unban a member from the server
router.post('/unban', ensureRoleAdmin, async (req, res) => {
    const { userId, reason } = req.body;

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
    }

    try {
        const result = await unbanMember(userId, reason || 'No reason provided', req.user.username);

        if (!result) {
            return res.status(500).json({ message: 'Failed to connect to Discord' });
        }
        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        // Log action
        await Log.create({
            action: 'Unban Member',
            category: 'Moderation',
            details: { reason },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId,
            targetName: result.username || userId
        });

        // Send Webhook Log
        await sendWebhookLog(
            process.env.MODERATION_WEBHOOK || process.env.SYSTEM_WEBHOOK,
            '✅ Member Unbanned',
            0x57F287, // Green
            [
                { name: 'User', value: `${result.username} (<@${userId}>)`, inline: true },
                { name: 'Moderator', value: `<@${req.user.discordId}>`, inline: true },
                { name: 'Reason', value: reason || 'No reason provided', inline: false }
            ],
            result.avatar
        );

        res.json({ message: `${result.username} has been unbanned successfully` });
    } catch (err) {
        console.error('Unban error:', err);
        res.status(500).json({ message: 'Error unbanning member: ' + err.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Jail = require('../models/Jail');
const Log = require('../models/Log');
const { jailMember, unjailMember } = require('../services/discordBot');
const { scheduleUnjail, cancelScheduledUnjail } = require('../services/jailScheduler');
const { ensureRoleAdmin } = require('../middleware/auth');
const { sendWebhookLog } = require('../utils/webhookLogger');

// @route   POST /api/jail
// @desc    Jail a member (strip roles, assign Jailed role, DM them)
router.post('/', ensureRoleAdmin, async (req, res) => {
    const { userId, reason, duration, durationUnit } = req.body;

    if (!userId || !reason || !duration) {
        return res.status(400).json({ message: 'User ID, reason, and duration are required' });
    }

    try {
        // Check if already jailed
        const existing = await Jail.findOne({ userId, isActive: true });
        if (existing) {
            return res.status(400).json({ message: 'This member is already jailed' });
        }

        // Calculate expiration
        let expiresAt = new Date();
        if (durationUnit === 'm') expiresAt.setMinutes(expiresAt.getMinutes() + duration);
        if (durationUnit === 'h') expiresAt.setHours(expiresAt.getHours() + duration);
        if (durationUnit === 'd') expiresAt.setDate(expiresAt.getDate() + duration);

        // Perform the jail via Discord bot
        const result = await jailMember(userId, reason, duration, durationUnit, req.user.username);

        if (!result) {
            return res.status(500).json({ message: 'Failed to connect to Discord' });
        }
        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        // Save to database
        const jailEntry = await Jail.create({
            userId,
            username: result.username,
            guildId: process.env.DISCORD_GUILD_ID,
            reason,
            expiresAt,
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            rolesBeforeJail: result.rolesBefore
        });

        // Log action
        await Log.create({
            action: 'Jail Member',
            category: 'Jail',
            details: { reason, duration, durationUnit, expiresAt, username: result.username },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId,
            targetName: result.username
        });

        // Schedule automatic unjail
        scheduleUnjail(jailEntry);

        // Send Webhook Log
        await sendWebhookLog(
            process.env.JAIL_WEBHOOK,
            '🔒 Member Jailed',
            0xFFA500, // Orange
            [
                { name: 'User', value: `${result.username} (<@${userId}>)`, inline: true },
                { name: 'Moderator', value: `<@${req.user.discordId}>`, inline: true },
                { name: 'Duration', value: `${duration}${durationUnit}`, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Expires At', value: expiresAt.toLocaleString(), inline: false }
            ],
            result.avatar
        );

        res.json({
            message: `${result.username} has been jailed successfully`,
            entry: jailEntry
        });
    } catch (err) {
        console.error('Jail error:', err);
        res.status(500).json({ message: 'Error jailing member: ' + err.message });
    }
});

// @route   GET /api/jail/active
// @desc    Get active jail entries
router.get('/active', ensureRoleAdmin, async (req, res) => {
    try {
        const entries = await Jail.find({ isActive: true }).sort({ jailedAt: -1 });
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching jail entries' });
    }
});

// @route   GET /api/jail/history
// @desc    Get full jail history
router.get('/history', ensureRoleAdmin, async (req, res) => {
    try {
        const entries = await Jail.find().sort({ jailedAt: -1 }).limit(100);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// @route   POST /api/jail/unjail/:id
// @desc    Unjail a member (restore roles, DM them)
router.post('/unjail/:id', ensureRoleAdmin, async (req, res) => {
    try {
        const entry = await Jail.findById(req.params.id);
        if (!entry) return res.status(404).json({ message: 'Entry not found' });
        if (!entry.isActive) return res.status(400).json({ message: 'This member is already unjailed' });

        // Cancel auto-unjail timer
        cancelScheduledUnjail(entry._id);

        // Perform the unjail via Discord bot
        const result = await unjailMember(entry.userId, entry.rolesBeforeJail, req.user.username);

        if (!result) {
            return res.status(500).json({ message: 'Failed to connect to Discord' });
        }
        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        // Update database
        entry.isActive = false;
        entry.unjailedBy = req.user.username;
        entry.unjailedAt = new Date();
        await entry.save();

        // Log action
        await Log.create({
            action: 'Unjail Member',
            category: 'Jail',
            details: { username: entry.username },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: entry.userId,
            targetName: entry.username
        });

        // Send Webhook Log
        await sendWebhookLog(
            process.env.JAIL_WEBHOOK,
            '🔓 Member Unjailed',
            0x57F287, // Green
            [
                { name: 'User', value: `${entry.username} (<@${entry.userId}>)`, inline: true },
                { name: 'Moderated By', value: `<@${req.user.discordId}>`, inline: true }
            ]
        );

        res.json({ message: `${entry.username || entry.userId} has been unjailed and roles restored` });
    } catch (err) {
        console.error('Unjail error:', err);
        res.status(500).json({ message: 'Error unjailing member' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Rejected = require('../models/Rejected');
const Log = require('../models/Log');
const { rejectMember, unrejectMember } = require('../services/discordBot');
const { ensureRoleAdmin } = require('../middleware/auth');
const { sendWebhookLog } = require('../utils/webhookLogger');

// @route   POST /api/rejected
// @desc    Reject a member (strip roles, assign Rejected role, DM them)
router.post('/', ensureRoleAdmin, async (req, res) => {
    const { userId, reason } = req.body;

    if (!userId || !reason) {
        return res.status(400).json({ message: 'User ID and reason are required' });
    }

    try {
        // Check if already rejected
        const existing = await Rejected.findOne({ userId, isActive: true });
        if (existing) {
            return res.status(400).json({ message: 'This member is already rejected' });
        }

        // Perform the rejection via Discord bot
        const result = await rejectMember(userId, reason, req.user.username);

        if (!result) {
            return res.status(500).json({ message: 'Failed to connect to Discord' });
        }
        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        // Save to database
        const rejectedEntry = await Rejected.create({
            userId,
            username: result.username,
            guildId: process.env.DISCORD_GUILD_ID,
            reason,
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            rolesBeforeReject: result.rolesBefore
        });

        // Log action
        await Log.create({
            action: 'Reject Member',
            category: 'Rejected',
            details: { reason, username: result.username },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId,
            targetName: result.username
        });

        // Send Webhook Log
        await sendWebhookLog(
            process.env.REJECT_WEBHOOK,
            '⛔ Member Rejected',
            0xED4245, // Red
            [
                { name: 'User', value: `${result.username} (<@${userId}>)`, inline: true },
                { name: 'Moderator', value: `<@${req.user.discordId}>`, inline: true },
                { name: 'Reason', value: reason, inline: false }
            ],
            result.avatar
        );

        res.json({
            message: `${result.username} has been rejected successfully`,
            entry: rejectedEntry
        });
    } catch (err) {
        console.error('Reject error:', err);
        res.status(500).json({ message: 'Error rejecting member: ' + err.message });
    }
});

// @route   GET /api/rejected/active
// @desc    Get all currently rejected members
router.get('/active', ensureRoleAdmin, async (req, res) => {
    try {
        const entries = await Rejected.find({ isActive: true }).sort({ rejectedAt: -1 });
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching rejected members' });
    }
});

// @route   GET /api/rejected/history
// @desc    Get full reject/unreject history
router.get('/history', ensureRoleAdmin, async (req, res) => {
    try {
        const entries = await Rejected.find().sort({ rejectedAt: -1 }).limit(100);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// @route   POST /api/rejected/unreject/:id
// @desc    Unreject a member (restore roles, DM them)
router.post('/unreject/:id', ensureRoleAdmin, async (req, res) => {
    try {
        const entry = await Rejected.findById(req.params.id);
        if (!entry) return res.status(404).json({ message: 'Entry not found' });
        if (!entry.isActive) return res.status(400).json({ message: 'This member is already unrejected' });

        // Perform the unreject via Discord bot
        const result = await unrejectMember(entry.userId, entry.rolesBeforeReject, req.user.username);

        if (!result) {
            return res.status(500).json({ message: 'Failed to connect to Discord' });
        }
        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        // Update database
        entry.isActive = false;
        entry.unrejectReason = req.body.reason || 'No reason provided';
        entry.unrejectedBy = req.user.username;
        entry.unrejectedAt = new Date();
        await entry.save();

        // Log action
        await Log.create({
            action: 'Unreject Member',
            category: 'Rejected',
            details: { username: entry.username, reason: req.body.reason },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: entry.userId,
            targetName: entry.username
        });

        // Send Webhook Log
        await sendWebhookLog(
            process.env.REJECT_WEBHOOK,
            '✅ Member Unrejected',
            0x57F287, // Green
            [
                { name: 'User', value: `${entry.username} (<@${entry.userId}>)`, inline: true },
                { name: 'Moderated By', value: `<@${req.user.discordId}>`, inline: true },
                { name: 'Reason', value: req.body.reason || 'No reason provided', inline: false }
            ]
        );

        res.json({ message: `${entry.username} has been unrejected and roles restored` });
    } catch (err) {
        console.error('Unreject error:', err);
        res.status(500).json({ message: 'Error unrejecting member' });
    }
});

module.exports = router;

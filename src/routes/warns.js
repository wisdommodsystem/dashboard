const express = require('express');
const router = express.Router();
const Warn = require('../models/Warn');
const Rejected = require('../models/Rejected');
const Log = require('../models/Log');
const { warnMember, rejectMember } = require('../services/discordBot');
const { ensureStaffOrAdmin } = require('../middleware/auth');
const { sendWebhookLog } = require('../utils/webhookLogger');

// @route   POST /api/warns
// @desc    Warn a member. If they reach 5 active warns, reject them.
router.post('/', ensureStaffOrAdmin, async (req, res) => {
    const { userId, reason } = req.body;

    if (!userId || !reason) {
        return res.status(400).json({ message: 'User ID and reason are required' });
    }

    try {
        // Count existing active warns
        const activeWarns = await Warn.countDocuments({ userId, isActive: true });
        const newWarnCount = activeWarns + 1;

        if (newWarnCount >= 5) {
            // Member reached 5 warns -> REJECT them automatically
            
            // 1. Perform reject via Discord Bot
            const rejectReason = `Reached 5 warnings. Last Warning: ${reason}`;
            const result = await rejectMember(userId, rejectReason, 'System (Auto-Reject)');

            if (!result || result.error) {
                return res.status(500).json({ message: result?.error || 'Failed to auto-reject member via Discord' });
            }

            // 2. Clear all active warns for this user since they are now rejected
            await Warn.updateMany(
                { userId, isActive: true },
                { isActive: false, clearedBy: 'System (Auto)', clearedAt: new Date() }
            );

            // 3. Create Rejected entry
            await Rejected.create({
                userId,
                username: result.username,
                guildId: process.env.DISCORD_GUILD_ID,
                reason: rejectReason,
                moderatorId: req.user.discordId,
                moderatorName: req.user.username,
                rolesBeforeReject: result.rolesBefore
            });

            // 4. Log the action
            await Log.create({
                action: 'Auto Reject (5 Warns)',
                category: 'System',
                details: { reason: rejectReason, username: result.username },
                moderatorId: 'SYSTEM',
                moderatorName: 'System (Auto)',
                targetId: userId,
                targetName: result.username
            });

            // Send Webhook Log for Auto Reject
            await sendWebhookLog(
                process.env.SYSTEM_WEBHOOK || process.env.REJECT_WEBHOOK,
                '🤖 Auto-Reject Triggered',
                0x000000, // Black/Dark
                [
                    { name: 'User', value: `${result.username} (<@${userId}>)`, inline: true },
                    { name: 'Reason', value: 'Reached 5 active warnings', inline: false }
                ],
                result.avatar
            );

            return res.json({
                message: `${result.username} reached 5 warnings and was automatically rejected.`,
                actionTaken: 'rejected'
            });
        }

        // Just add a warning
        const result = await warnMember(userId, reason, newWarnCount);

        if (!result) {
            return res.status(500).json({ message: 'Failed to connect to Discord' });
        }
        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        const warnEntry = await Warn.create({
            userId,
            username: result.username,
            guildId: process.env.DISCORD_GUILD_ID,
            reason,
            moderatorId: req.user.discordId,
            moderatorName: req.user.username
        });

        await Log.create({
            action: 'Warn Member',
            category: 'Warn',
            details: { reason, warnCount: newWarnCount, username: result.username },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId,
            targetName: result.username
        });

        // Send Webhook Log
        await sendWebhookLog(
            process.env.WARN_WEBHOOK,
            '⚠️ Member Warned',
            0xFFFF00, // Yellow
            [
                { name: 'User', value: `${result.username} (<@${userId}>)`, inline: true },
                { name: 'Moderator', value: `<@${req.user.discordId}>`, inline: true },
                { name: 'Warning Count', value: `${newWarnCount} / 5`, inline: true },
                { name: 'Reason', value: reason, inline: false }
            ],
            result.avatar
        );

        res.json({
            message: `${result.username} has been warned successfully (Warning ${newWarnCount}/5)`,
            actionTaken: 'warned',
            entry: warnEntry
        });

    } catch (err) {
        console.error('Warn error:', err);
        res.status(500).json({ message: 'Error warning member: ' + err.message });
    }
});

// @route   GET /api/warns/active
// @desc    Get all active warnings
router.get('/active', ensureStaffOrAdmin, async (req, res) => {
    try {
        const entries = await Warn.find({ isActive: true }).sort({ warnedAt: -1 });
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching active warnings' });
    }
});

// @route   GET /api/warns/history
// @desc    Get full warn history
router.get('/history', ensureStaffOrAdmin, async (req, res) => {
    try {
        const entries = await Warn.find().sort({ warnedAt: -1 }).limit(100);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// @route   POST /api/warns/clear/:id
// @desc    Clear a specific warning
router.post('/clear/:id', ensureStaffOrAdmin, async (req, res) => {
    try {
        const entry = await Warn.findById(req.params.id);
        if (!entry) return res.status(404).json({ message: 'Warning not found' });
        if (!entry.isActive) return res.status(400).json({ message: 'This warning is already cleared' });

        entry.isActive = false;
        entry.clearedBy = req.user.username;
        entry.clearedAt = new Date();
        await entry.save();

        await Log.create({
            action: 'Clear Warning',
            category: 'Warn',
            details: { username: entry.username, reason: entry.reason },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: entry.userId,
            targetName: entry.username
        });

        // Send Webhook Log
        await sendWebhookLog(
            process.env.WARN_WEBHOOK,
            '🗑️ Warning Cleared',
            0x5865F2, // Blurple
            [
                { name: 'User', value: `${entry.username} (<@${entry.userId}>)`, inline: true },
                { name: 'Cleared By', value: `<@${req.user.discordId}>`, inline: true },
                { name: 'Original Reason', value: entry.reason, inline: false }
            ]
        );

        res.json({ message: `Warning for ${entry.username || entry.userId} has been cleared` });
    } catch (err) {
        console.error('Clear warn error:', err);
        res.status(500).json({ message: 'Error clearing warning' });
    }
});

module.exports = router;

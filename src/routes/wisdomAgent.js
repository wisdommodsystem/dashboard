const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const Eye = require('../models/Eye');
const Log = require('../models/Log');
const { ensureRoleAdmin, ensureAdminOrAgent } = require('../middleware/auth');
const { getGuild, client } = require('../services/discordBot');
const { sendWebhookLog } = require('../utils/webhookLogger');

// ═══════════════════════════════════════════
// AGENTS SYSTEM
// ═══════════════════════════════════════════

// @route   GET /api/wisdom-agent/agents
router.get('/agents', ensureAdminOrAgent, async (req, res) => {
    try {
        const agents = await Agent.find().sort({ assignedDate: -1 });
        res.json(agents);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching agents' });
    }
});

// @route   POST /api/wisdom-agent/agents
router.post('/agents', ensureRoleAdmin, async (req, res) => {
    const { userId, notes } = req.body;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    try {
        const guild = await getGuild();
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return res.status(404).json({ message: 'Member not found in server' });

        const existing = await Agent.findOne({ userId });
        if (existing) return res.status(400).json({ message: 'User is already an agent' });

        const agent = await Agent.create({
            userId,
            username: member.user.username,
            avatar: member.user.displayAvatarURL(),
            notes
        });

        await Log.create({
            action: 'Add Agent',
            category: 'Wisdom Agent',
            details: { username: member.user.username },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId,
            targetName: member.user.username
        });

        res.json({ message: 'Agent added successfully', agent });
    } catch (err) {
        res.status(500).json({ message: 'Error adding agent: ' + err.message });
    }
});

// @route   DELETE /api/wisdom-agent/agents/:id
router.delete('/agents/:id', ensureRoleAdmin, async (req, res) => {
    try {
        const agent = await Agent.findByIdAndDelete(req.params.id);
        if (!agent) return res.status(404).json({ message: 'Agent not found' });
        res.json({ message: 'Agent removed' });
    } catch (err) {
        res.status(500).json({ message: 'Error removing agent' });
    }
});

// ═══════════════════════════════════════════
// EYE (SURVEILLANCE) SYSTEM
// ═══════════════════════════════════════════

// @route   GET /api/wisdom-agent/eye
router.get('/eye', ensureAdminOrAgent, async (req, res) => {
    try {
        const list = await Eye.find({ isActive: true }).sort({ addedAt: -1 });
        res.json(list);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching eye list' });
    }
});

// @route   POST /api/wisdom-agent/eye
router.post('/eye', ensureAdminOrAgent, async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId || !reason) return res.status(400).json({ message: 'User ID and reason are required' });

    try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const existing = await Eye.findOne({ userId, isActive: true });
        if (existing) return res.status(400).json({ message: 'User is already under surveillance' });

        const eyeEntry = await Eye.create({
            userId,
            username: user.username,
            avatar: user.displayAvatarURL(),
            reason,
            addedBy: req.user.username
        });

        const mention = process.env.EYE_WEBHOOK_ROLEID ? `<@&${process.env.EYE_WEBHOOK_ROLEID}>` : null;

        await sendWebhookLog(
            process.env.EYE_WEBHOOK,
            '👁️ Target Added to Eye List',
            0x3498db, // Blue
            [
                { name: 'Target', value: `${user.username} (<@${userId}>)`, inline: true },
                { name: 'Added By', value: `<@${req.user.discordId}>`, inline: true },
                { name: 'Reason', value: reason, inline: false }
            ],
            user.displayAvatarURL(),
            mention
        );

        res.json({ message: 'User added to surveillance list', eyeEntry });
    } catch (err) {
        res.status(500).json({ message: 'Error adding to eye list: ' + err.message });
    }
});

// @route   DELETE /api/wisdom-agent/eye/:id
router.delete('/eye/:id', ensureAdminOrAgent, async (req, res) => {
    try {
        const entry = await Eye.findByIdAndUpdate(req.params.id, { isActive: false });
        if (!entry) return res.status(404).json({ message: 'Entry not found' });
        
        const mention = process.env.EYE_WEBHOOK_ROLEID ? `<@&${process.env.EYE_WEBHOOK_ROLEID}>` : null;

        await sendWebhookLog(
            process.env.EYE_WEBHOOK,
            '✅ Target Removed from Eye List',
            0x2ecc71, // Green
            [
                { name: 'Target', value: `${entry.username} (<@${entry.userId}>)`, inline: true },
                { name: 'Removed By', value: `<@${req.user.discordId}>`, inline: true }
            ],
            null,
            mention
        );

        res.json({ message: 'User removed from surveillance' });
    } catch (err) {
        res.status(500).json({ message: 'Error removing from eye list' });
    }
});

module.exports = router;

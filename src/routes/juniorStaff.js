const express = require('express');
const router = express.Router();
const { ensureJuniorStaffOrAbove } = require('../middleware/auth');
const { muteMember, changeNickname, client, getGuild } = require('../services/discordBot');
const Note = require('../models/Note');
const Mute = require('../models/Mute');
const Log = require('../models/Log');
const { sendWebhookLog } = require('../utils/webhookLogger');

// ═══════════════════════════════════════════
// MUTE SYSTEM
// ═══════════════════════════════════════════

// @route   GET /api/junior-staff/mutes
// @desc    Get all mute records
router.get('/mutes', ensureJuniorStaffOrAbove, async (req, res) => {
    try {
        const mutes = await Mute.find().sort({ createdAt: -1 }).limit(100);
        // Auto-mark expired mutes
        const now = new Date();
        for (const m of mutes) {
            if (m.active && m.expiresAt && m.expiresAt < now) {
                m.active = false;
                await m.save();
            }
        }
        res.json(mutes);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching mutes' });
    }
});

// @route   POST /api/junior-staff/mute
router.post('/mute', ensureJuniorStaffOrAbove, async (req, res) => {
    const { userId, reason, duration } = req.body;
    if (!userId || !reason || !duration) return res.status(400).json({ message: 'Missing required fields' });

    try {
        const result = await muteMember(userId, reason, duration, req.user.username);
        if (result.error) return res.status(400).json({ message: result.error });

        // Save mute record
        const expiresAt = new Date(Date.now() + duration * 60 * 1000);
        await Mute.create({
            userId,
            username: result.username,
            displayName: result.displayName,
            avatar: result.avatar,
            reason,
            duration,
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            expiresAt
        });

        // Log to DB
        await Log.create({
            action: 'Mute',
            category: 'Junior Staff',
            details: { reason, duration: `${duration}m` },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId,
            targetName: result.username
        });

        // Webhook
        if (process.env.STAFF_ACTIONS_WEB) {
            await sendWebhookLog(
                process.env.STAFF_ACTIONS_WEB,
                '🔇 Member Muted',
                0xffa500,
                [
                    { name: 'Member', value: `${result.username} (<@${userId}>)`, inline: true },
                    { name: 'Staff', value: `<@${req.user.discordId}>`, inline: true },
                    { name: 'Duration', value: `${duration} minutes`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                ],
                result.avatar
            );
        }

        res.json({ message: 'Member muted successfully', result });
    } catch (err) {
        res.status(500).json({ message: 'Error muting member: ' + err.message });
    }
});

// @route   POST /api/junior-staff/unmute
router.post('/unmute', ensureJuniorStaffOrAbove, async (req, res) => {
    const { userId, muteId } = req.body;
    if (!userId) return res.status(400).json({ message: 'Missing userId' });

    try {
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ message: 'Guild not found' });

        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
            await member.timeout(null, 'Unmuted via dashboard');
        }

        // Mark mute as inactive
        if (muteId) {
            await Mute.findByIdAndUpdate(muteId, { active: false });
        } else {
            await Mute.updateMany({ userId, active: true }, { active: false });
        }

        await Log.create({
            action: 'Unmute',
            category: 'Junior Staff',
            details: {},
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId
        });

        res.json({ message: 'Member unmuted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error unmuting member' });
    }
});

// @route   DELETE /api/junior-staff/mutes/:id
router.delete('/mutes/:id', ensureJuniorStaffOrAbove, async (req, res) => {
    try {
        await Mute.findByIdAndDelete(req.params.id);
        res.json({ message: 'Mute record removed' });
    } catch (err) {
        res.status(500).json({ message: 'Error removing mute record' });
    }
});

// ═══════════════════════════════════════════
// NICKNAME SYSTEM
// ═══════════════════════════════════════════

router.post('/nickname', ensureJuniorStaffOrAbove, async (req, res) => {
    const { userId, newNickname } = req.body;
    if (!userId || newNickname === undefined) return res.status(400).json({ message: 'Missing required fields' });

    try {
        const result = await changeNickname(userId, newNickname, req.user.username);
        if (result.error) return res.status(400).json({ message: result.error });

        await Log.create({
            action: 'Change Nickname',
            category: 'Junior Staff',
            details: { oldNickname: result.oldNickname, newNickname: result.newNickname },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId,
            targetName: result.username
        });

        res.json({ message: 'Nickname changed successfully', result });
    } catch (err) {
        res.status(500).json({ message: 'Error changing nickname' });
    }
});

// ═══════════════════════════════════════════
// NOTES SYSTEM
// ═══════════════════════════════════════════

// @route   GET /api/junior-staff/notes (all notes)
router.get('/notes', ensureJuniorStaffOrAbove, async (req, res) => {
    try {
        const notes = await Note.find().sort({ createdAt: -1 }).limit(100);
        res.json(notes);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching notes' });
    }
});

// @route   GET /api/junior-staff/notes/:userId
router.get('/notes/:userId', ensureJuniorStaffOrAbove, async (req, res) => {
    try {
        const notes = await Note.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(notes);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching notes' });
    }
});

// @route   POST /api/junior-staff/notes
router.post('/notes', ensureJuniorStaffOrAbove, async (req, res) => {
    const { userId, reason, note } = req.body;
    if (!userId || !reason || !note) return res.status(400).json({ message: 'Missing fields' });

    try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const newNote = await Note.create({
            userId,
            username: user.username,
            reason,
            note,
            moderatorId: req.user.discordId,
            moderatorName: req.user.username
        });

        res.json({ message: 'Note added successfully', note: newNote });
    } catch (err) {
        res.status(500).json({ message: 'Error adding note' });
    }
});

// @route   PUT /api/junior-staff/notes/:id
router.put('/notes/:id', ensureJuniorStaffOrAbove, async (req, res) => {
    const { reason, note } = req.body;
    try {
        const updated = await Note.findByIdAndUpdate(
            req.params.id,
            { reason, note },
            { new: true }
        );
        if (!updated) return res.status(404).json({ message: 'Note not found' });
        res.json({ message: 'Note updated', note: updated });
    } catch (err) {
        res.status(500).json({ message: 'Error updating note' });
    }
});

// @route   DELETE /api/junior-staff/notes/:id
router.delete('/notes/:id', ensureJuniorStaffOrAbove, async (req, res) => {
    try {
        await Note.findByIdAndDelete(req.params.id);
        res.json({ message: 'Note removed' });
    } catch (err) {
        res.status(500).json({ message: 'Error removing note' });
    }
});

module.exports = router;

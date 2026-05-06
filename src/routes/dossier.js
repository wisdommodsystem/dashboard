const express = require('express');
const router = express.Router();
const { ensureStaffOrAdmin } = require('../middleware/auth');
const Jail = require('../models/Jail');
const Rejected = require('../models/Rejected');
const Warn = require('../models/Warn');
const Note = require('../models/Note');
const Mute = require('../models/Mute');
const Eye = require('../models/Eye');
const Log = require('../models/Log');
const { client } = require('../services/discordBot');

// @route   GET /api/dossier/:userId
// @desc    Get the full intelligence dossier for a member
router.get('/:userId', ensureStaffOrAdmin, async (req, res) => {
    try {
        const userId = req.params.userId;
        let discordData = null;

        // Try to fetch basic member details from Discord
        try {
            const user = await client.users.fetch(userId);
            discordData = {
                id: user.id,
                username: user.username,
                displayName: user.displayName || user.username,
                avatar: user.displayAvatarURL({ dynamic: true, size: 256 })
            };
        } catch (e) {
            console.log('User not found on discord network');
        }

        // Fetch all history concurrently
        const [
            jails,
            rejects,
            warns,
            notes,
            mutes,
            eye,
            logs
        ] = await Promise.all([
            Jail.find({ userId }).sort({ jailedAt: -1 }),
            Rejected.find({ userId }).sort({ rejectedAt: -1 }),
            Warn.find({ userId }).sort({ warnedAt: -1 }),
            Note.find({ userId }).sort({ createdAt: -1 }),
            Mute.find({ userId }).sort({ createdAt: -1 }),
            Eye.findOne({ userId, isActive: true }),
            Log.find({ targetId: userId }).sort({ timestamp: -1 })
        ]);

        res.json({
            discordData,
            history: {
                jails,
                rejects,
                warns,
                notes,
                mutes,
                logs
            },
            isUnderSurveillance: !!eye,
            surveillanceDetails: eye || null,
            totalOffenses: jails.length + rejects.length + warns.length + mutes.length
        });

    } catch (err) {
        console.error('Dossier error:', err);
        res.status(500).json({ message: 'Error fetching dossier' });
    }
});

module.exports = router;

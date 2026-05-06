const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { getChannels, sendAnnouncement } = require('../services/discordBot');
const { ensureRoleAdmin } = require('../middleware/auth');

// @route   GET /api/announce/channels
// @desc    Get all text channels for the dropdown
router.get('/channels', ensureRoleAdmin, async (req, res) => {
    try {
        const channels = await getChannels();
        res.json(channels);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching channels' });
    }
});

// @route   POST /api/announce
// @desc    Send an announcement embed to a channel
router.post('/', ensureRoleAdmin, async (req, res) => {
    const { 
        channelId, title, description, color, imageUrl, thumbnailUrl, footer, 
        buttons = [], // Accepts array of {label, url}
        author = {}   // Accepts {name, icon, url}
    } = req.body;

    if (!channelId || (!title && !description)) {
        return res.status(400).json({ message: 'Channel and at least a title or description are required.' });
    }

    try {
        // If author name is not provided, default to the moderator
        const authorName = author.name || req.user.username;
        const authorIcon = author.icon || (req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.discordId}/${req.user.avatar}.png` : null);

        const result = await sendAnnouncement(
            channelId, 
            title, 
            description, 
            color, 
            imageUrl, 
            thumbnailUrl, 
            footer, 
            buttons, 
            { name: authorName, icon: authorIcon, url: author.url }
        );

        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        // Log action
        await Log.create({
            action: 'Send Announcement',
            category: 'Announcement',
            details: { channelId, title },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: channelId,
            targetName: 'Channel'
        });

        res.json({ message: 'Announcement sent successfully!' });
    } catch (err) {
        console.error('Announce error:', err);
        res.status(500).json({ message: 'Error sending announcement: ' + err.message });
    }
});

module.exports = router;

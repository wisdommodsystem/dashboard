const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { ensureAuthenticated } = require('../middleware/auth');
const { getGuild } = require('../services/discordBot');

// Middleware to check if user is Admin Role or Staff Role
const ensureEventCreator = async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const botGuild = await getGuild();
        if (botGuild) {
            const member = await botGuild.members.fetch(req.user.discordId).catch(() => null);
            if (member) {
                const isAdmin = process.env.ADMINISTRATOR_ROLEID && member.roles.cache.has(process.env.ADMINISTRATOR_ROLEID);
                const isStaff = process.env.STAFFROLE_ID && member.roles.cache.has(process.env.STAFFROLE_ID);
                
                if (isAdmin || isStaff || (req.user.guilds.find(g => g.id === process.env.DISCORD_GUILD_ID)?.permissions & 0x8)) {
                    return next();
                }
            }
        }
    } catch (err) {
        console.error('Event Perm Check error:', err);
    }
    
    res.status(403).json({ message: 'Forbidden: You do not have permission to manage events' });
};

// @route   GET /api/events/channels
// @desc    Get voice and stage channels for event selection
router.get('/channels', ensureEventCreator, async (req, res) => {
    try {
        const botGuild = await getGuild();
        if (!botGuild) return res.status(500).json({ message: 'Bot could not reach guild' });

        const channels = botGuild.channels.cache
            .filter(c => c.type === 2 || c.type === 13) // Voice (2) and Stage (13)
            .map(c => ({
                id: c.id,
                name: c.name,
                type: c.type === 13 ? 'Stage' : 'Voice'
            }));

        res.json(channels);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching channels' });
    }
});

// @route   GET /api/events
// @desc    Get all events
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const events = await Event.find().sort({ eventTime: 1 });
        res.json(events);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching events' });
    }
});

// @route   POST /api/events
// @desc    Create a new event
router.post('/', ensureEventCreator, async (req, res) => {
    const { name, description, eventTime, imageUrl, channelId } = req.body;

    if (!name || !description || !eventTime) {
        return res.status(400).json({ message: 'Please provide name, description and time' });
    }

    try {
        const botGuild = await getGuild();
        let discordEventId = null;

        if (botGuild && channelId) {
            try {
                const startTime = new Date(eventTime);
                // Ensure end time is at least 1 hour later (Discord requires it)
                const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

                const channel = await botGuild.channels.fetch(channelId);
                const entityType = channel.type === 13 ? 1 : 2; // STAGE_INSTANCE = 1, VOICE = 2

                const scheduledEvent = await botGuild.scheduledEvents.create({
                    name,
                    description,
                    scheduledStartTime: startTime,
                    scheduledEndTime: endTime,
                    privacyLevel: 2, // GUILD_ONLY / GuildScheduledEventPrivacyLevel.GuildOnly
                    entityType: entityType,
                    channel: channelId,
                    image: imageUrl || undefined,
                    reason: `Created via Dashboard by ${req.user.username}`
                });
                discordEventId = scheduledEvent.id;
            } catch (discordErr) {
                console.error('Discord Event Creation Error:', discordErr);
                // Continue even if Discord fails, maybe? No, let's warn if strictly required.
            }
        }

        const newEvent = new Event({
            name,
            description,
            eventTime: new Date(eventTime),
            imageUrl,
            channelId,
            discordEventId,
            authorId: req.user.discordId,
            authorName: req.user.displayName || req.user.username
        });

        await newEvent.save();
        res.status(201).json(newEvent);
    } catch (err) {
        console.error('Create Event error:', err);
        res.status(500).json({ message: 'Error creating event' });
    }
});

// @route   DELETE /api/events/:id
// @desc    Delete an event
router.delete('/:id', ensureEventCreator, async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        
        // Try to delete from Discord if exists
        if (event.discordEventId) {
            try {
                const botGuild = await getGuild();
                if (botGuild) {
                    await botGuild.scheduledEvents.delete(event.discordEventId).catch(() => null);
                }
            } catch (e) {}
        }

        await event.deleteOne();
        res.json({ message: 'Event removed' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting event' });
    }
});

module.exports = router;

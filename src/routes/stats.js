const express = require('express');
const router = express.Router();
const { getStats } = require('../services/discordBot');
const { ensureStaffOrAdmin } = require('../middleware/auth');
const Log = require('../models/Log');

// @route   GET /api/stats
// @desc    Get server statistics
router.get('/', ensureStaffOrAdmin, async (req, res) => {
    try {
        const stats = await getStats();
        if (!stats) return res.status(404).json({ message: 'Guild not found' });
        
        const recentLogs = await Log.find().sort({ timestamp: -1 }).limit(10);
        res.json({ ...stats, recentLogs });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching stats' });
    }
});
const { scrapeServerInfo } = require('../services/botlistScraper');

// @route   GET /api/stats/external
// @desc    Get public server statistics from discordbotlist
router.get('/external', async (req, res) => {
    try {
        const info = await scrapeServerInfo();
        res.json(info);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching external stats' });
    }
});

module.exports = router;

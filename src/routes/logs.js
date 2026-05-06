const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { ensureStaffOrAdmin } = require('../middleware/auth');

// @route   GET /api/logs
// @desc    Get all logs
router.get('/', ensureStaffOrAdmin, async (req, res) => {
    try {
        const logs = await Log.find().sort({ timestamp: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching logs' });
    }
});

// @route   GET /api/logs/recent
// @desc    Get very recent logs for live stream (Lightweight)
router.get('/recent', ensureStaffOrAdmin, async (req, res) => {
    try {
        // Only fetch the last 10 logs, selecting only necessary fields to save RAM/Bandwidth
        const logs = await Log.find()
            .sort({ timestamp: -1 })
            .limit(10)
            .select('action category moderatorName targetName timestamp');
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching recent logs' });
    }
});

module.exports = router;

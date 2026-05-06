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

module.exports = router;

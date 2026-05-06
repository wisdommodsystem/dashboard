const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { ensureRoleAdmin } = require('../middleware/auth');

// @route   GET /api/stats/staff-leaderboard
// @desc    Get staff activity rankings and breakdown
router.get('/leaderboard', ensureRoleAdmin, async (req, res) => {
    try {
        const { period } = req.query; // 'day', 'week', 'month', 'all'
        let dateFilter = {};

        const now = new Date();
        if (period === 'day') {
            dateFilter = { timestamp: { $gte: new Date(now.setHours(0,0,0,0)) } };
        } else if (period === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateFilter = { timestamp: { $gte: weekAgo } };
        } else if (period === 'month') {
            const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
            dateFilter = { timestamp: { $gte: monthAgo } };
        }

        // Aggregate logs by moderator
        const leaderboard = await Log.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: "$moderatorId",
                    moderatorName: { $first: "$moderatorName" },
                    totalActions: { $sum: 1 },
                    actions: {
                        $push: {
                            category: "$category",
                            action: "$action"
                        }
                    },
                    lastActive: { $max: "$timestamp" }
                }
            },
            {
                $project: {
                    moderatorId: "$_id",
                    moderatorName: 1,
                    totalActions: 1,
                    lastActive: 1,
                    breakdown: {
                        jails: {
                            $size: {
                                $filter: {
                                    input: "$actions",
                                    as: "a",
                                    cond: { $eq: ["$$a.category", "Jail"] }
                                }
                            }
                        },
                        warns: {
                            $size: {
                                $filter: {
                                    input: "$actions",
                                    as: "a",
                                    cond: { $in: ["$$a.category", ["Warn", "Warning"]] }
                                }
                            }
                        },
                        rejects: {
                            $size: {
                                $filter: {
                                    input: "$actions",
                                    as: "a",
                                    cond: { $in: ["$$a.category", ["Rejected", "Reject"]] }
                                }
                            }
                        },
                        notes: {
                            $size: {
                                $filter: {
                                    input: "$actions",
                                    as: "a",
                                    cond: { $eq: ["$$a.category", "Note"] }
                                }
                            }
                        },
                        mutes: {
                            $size: {
                                $filter: {
                                    input: "$actions",
                                    as: "a",
                                    cond: { $in: ["$$a.category", ["Mute", "Mutes"]] }
                                }
                            }
                        }
                    }
                }
            },
            { $sort: { totalActions: -1 } }
        ]);

        res.json(leaderboard);
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ message: 'Error calculating performance stats' });
    }
});

module.exports = router;

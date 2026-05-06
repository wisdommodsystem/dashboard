const express = require('express');
const router = express.Router();
const { getRoles, getMembers, getGuild } = require('../services/discordBot');
const { ensureStaffOrAdmin, ensureRoleAdmin } = require('../middleware/auth');
const Log = require('../models/Log');

// @route   GET /api/roles
// @desc    Get all roles
router.get('/', ensureStaffOrAdmin, async (req, res) => {
    try {
        const roles = await getRoles();
        res.json(roles);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching roles' });
    }
});

// @route   GET /api/roles/members
// @desc    Get all members for selection (Junior Staff+ can access)
router.get('/members', ensureStaffOrAdmin, async (req, res) => {
    try {
        const members = await getMembers();
        res.json(members);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching members' });
    }
});

// @route   POST /api/roles/assign
// @desc    Assign a role to a member
router.post('/assign', ensureRoleAdmin, async (req, res) => {
    const { userId, roleId } = req.body;
    try {
        const guild = await getGuild();
        if (!guild) return res.status(404).json({ message: 'Guild not found' });
        
        const member = await guild.members.fetch(userId);
        await member.roles.add(roleId);

        // Log action
        await Log.create({
            action: 'Assign Role',
            category: 'Role',
            details: { roleId },
            moderatorId: req.user.discordId,
            moderatorName: req.user.username,
            targetId: userId
        });

        res.json({ message: 'Role assigned' });
    } catch (err) {
        res.status(500).json({ message: 'Error assigning role: ' + err.message });
    }
});

module.exports = router;

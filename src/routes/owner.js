const express = require('express');
const router = express.Router();
const { ensureOwner, ensureRoleAdmin } = require('../middleware/auth');
const StaffStatus = require('../models/StaffStatus');
const { getGuild } = require('../services/discordBot');
const axios = require('axios');

// Variables for local caching to prevent Rate Limits
let staffCache = null;
let lastStaffFetch = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// @route   GET /api/owner/staff
// @desc    Get all current staff and their administrative status
router.get('/staff', ensureOwner, async (req, res) => {
    try {
        const currentTime = Date.now();
        
        // Return cache if it's still fresh (within 5 minutes)
        if (staffCache && (currentTime - lastStaffFetch < CACHE_DURATION)) {
            return res.json(staffCache);
        }

        const botGuild = await getGuild();
        if (!botGuild) return res.status(500).json({ message: 'Bot could not reach guild' });

        const staffRole = process.env.STAFFROLE_ID;
        const adminRole = process.env.ADMINISTRATOR_ROLEID;
        const juniorRole = process.env.JUNIOR_STAFF_ROLEID;
        const ownerRole = process.env.OWNER_ROLE_ID;

        // Ensure we only fetch specific IDs, excluding the guild ID (@everyone)
        const rolesToFetch = [staffRole, adminRole, juniorRole, ownerRole].filter(id => id && id !== botGuild.id);
        
        let staffMembers = new Map();

        for (const roleId of rolesToFetch) {
            try {
                // Fetch members specifically for this role
                const members = await botGuild.members.fetch({ role: roleId, force: true });
                if (members) {
                    members.forEach(member => staffMembers.set(member.id, member));
                }
            } catch (roleErr) {
                console.warn(`Could not fetch members for role ${roleId}:`, roleErr.message);
            }
        }

        const staffStatuses = await StaffStatus.find({});

        // FINAL FILTER: Double check they actually have one of the roles to be absolutely sure
        const result = Array.from(staffMembers.values())
            .filter(m => 
                (staffRole && m.roles.cache.has(staffRole)) || 
                (adminRole && m.roles.cache.has(adminRole)) || 
                (juniorRole && m.roles.cache.has(juniorRole)) ||
                (ownerRole && m.roles.cache.has(ownerRole))
            )
            .map(m => {
                const status = staffStatuses.find(s => s.userId === m.id);
                return {
                    id: m.id,
                    username: m.user.username,
                    displayName: m.displayName,
                    avatar: m.user.displayAvatarURL(),
                    roles: m.roles.cache.map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
                    status: status ? status.status : 'active',
                    reason: status ? status.reason : '',
                    until: status ? status.until : null
                };
            });

        // Update cache
        staffCache = result;
        lastStaffFetch = currentTime;

        res.json(result);
    } catch (err) {
        console.error('Owner Staff List error:', err);
        res.status(500).json({ message: 'Internal Server Error: Discord is currently busy, please try again in a moment.' });
    }
});

// @route   POST /api/owner/update-status
// @desc    Set staff status (resting, dismissed, active) and send DM
router.post('/update-status', ensureOwner, async (req, res) => {
    const { userId, status, reason, durationDays } = req.body;

    try {
        const botGuild = await getGuild();
        const member = await botGuild.members.fetch(userId).catch(() => null);
        
        let until = null;
        if (status === 'resting' && durationDays) {
            until = new Date();
            until.setDate(until.getDate() + parseInt(durationDays));
        }

        // Update DB
        await StaffStatus.findOneAndUpdate(
            { userId },
            { 
                status, 
                reason, 
                until, 
                updatedBy: req.user.discordId,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        // Notify user via Discord DM
        if (member) {
            try {
                const embed = {
                    title: '⭕ Administrative Notice: Wisdom Circle Management',
                    description: `Hello ${member.displayName}, an administrative action has been taken on your account regarding your staff position.`,
                    color: status === 'resting' ? 0xFFAA00 : (status === 'dismissed' ? 0xFF0000 : 0x00FF00),
                    fields: [
                        { name: 'New Status', value: status.toUpperCase(), inline: true },
                        { name: 'Reason', value: reason || 'No specific reason provided', inline: false }
                    ],
                    footer: { text: 'This action was taken by the Server Owner.' },
                    timestamp: new Date().toISOString()
                };

                if (until) {
                    embed.fields.push({ name: 'Duration', value: `Until ${until.toLocaleDateString()}`, inline: true });
                }

                await member.send({ embeds: [embed] });
            } catch (dmErr) {
                console.error(`Could not send DM to ${userId}:`, dmErr.message);
            }

            // If dismissed, optionally remove roles
            if (status === 'dismissed') {
                const rolesToRemove = [process.env.STAFFROLE_ID, process.env.ADMINISTRATOR_ROLEID, process.env.JUNIOR_STAFF_ROLEID].filter(id => id);
                await member.roles.remove(rolesToRemove, 'Dismissed from Staff via Dashboard').catch(console.error);
            }
        }

        res.json({ message: `Staff status updated to ${status}` });
    } catch (err) {
        console.error('Update Status error:', err);
        res.status(500).json({ message: 'Error updating staff status' });
    }
});

// @route   GET /api/owner/inactive-staff
// @desc    Get only resting or dismissed staff for dashboard warnings (Filtered to last 48h)
router.get('/inactive-staff', ensureRoleAdmin, async (req, res) => {
    try {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        const inactive = await StaffStatus.find({ 
            status: { $ne: 'active' },
            updatedAt: { $gte: twoDaysAgo }
        });
        res.json(inactive);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching inactive staff' });
    }
});

module.exports = router;

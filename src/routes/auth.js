const express = require('express');
const passport = require('passport');
const router = express.Router();

const rateLimit = require('express-rate-limit');
const Agent = require('../models/Agent');

// Rate limiter for local login to prevent brute force attacks
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per `window` (here, per 15 minutes)
    message: { message: 'Too many login attempts from this IP, please try again after 15 minutes' },
    standardHeaders: true, 
    legacyHeaders: false,
});

// @route   POST /api/auth/local-login
// @desc    First phase of login using credentials from .env
router.post('/local-login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    
    // Parse valid accounts from .env
    const authorizedUsersStr = process.env.DASHBOARD_USERS || '';
    if (!authorizedUsersStr) {
        return res.status(500).json({ message: 'Dashboard credentials not configured' });
    }

    // Format: user1:pass1,user2:pass2
    const pairs = authorizedUsersStr.split(',');
    let valid = false;

    for (const pair of pairs) {
        const [u, p] = pair.split(':');
        if (u === username && p === password) {
            valid = true;
            break;
        }
    }

    if (valid) {
        req.session.localAuthenticated = true;
        res.json({ message: 'Local authentication successful', success: true });
    } else {
        res.status(401).json({ message: 'Invalid username or password' });
    }
});

// @route   GET /api/auth/discord
// @desc    Authenticate with Discord (second phase)
router.get('/discord', (req, res, next) => {
    console.log(`[Auth] Session localAuthenticated: ${req.session.localAuthenticated}`);
    
    // In production, enforce local login first
    if (process.env.NODE_ENV === 'production' && !req.session.localAuthenticated) {
        return res.status(401).json({ message: 'Must complete local login first' });
    }
    next();
}, passport.authenticate('discord'));

const axios = require('axios');

// @route   GET /api/auth/discord/callback
// @desc    Discord authentication callback
router.get('/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/login'
}), async (req, res) => {
    // Successful authentication
    const user = req.user;
    
    // Send webhook if URL is provided in .env
    if (process.env.WEBHOOK_LOGIN) {
        try {
            const embed = {
                title: '🔐 New Dashboard Login',
                color: 0x5865F2,
                fields: [
                    { name: 'User', value: `<@${user.discordId}> (${user.username})`, inline: true },
                    { name: 'Email', value: user.email || 'No Email provided', inline: true },
                    { name: 'IP Address', value: user.lastIp || req.ip || req.headers['x-forwarded-for'] || 'Unknown', inline: false }
                ],
                thumbnail: { url: user.avatar ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png` : undefined },
                timestamp: new Date().toISOString()
            };
            
            await axios.post(process.env.WEBHOOK_LOGIN, {
                username: 'Dashboard Security',
                embeds: [embed]
            });
        } catch (webhookErr) {
            console.error('Failed to send login webhook', webhookErr.message);
        }
    }

    res.redirect((process.env.FRONTEND_URL || 'http://localhost:5173') + '/dashboard');
});

const { ensureStaffOrAdmin } = require('../middleware/auth');

// @route   GET /api/auth/user
// @desc    Get currently logged in user with roles
router.get('/user', async (req, res) => {
    if (req.isAuthenticated()) {
        const userObj = req.user.toObject ? req.user.toObject() : { ...req.user };
        
        // Inject Staff Status Check
        const StaffStatus = require('../models/StaffStatus');
        const statusDoc = await StaffStatus.findOne({ userId: req.user.discordId });
        if (statusDoc && statusDoc.status !== 'active') {
            // Check expiry for resting
            if (!(statusDoc.status === 'resting' && statusDoc.until && new Date() > statusDoc.until)) {
                return res.json({ 
                    ...userObj, 
                    restricted: true, 
                    staffStatus: statusDoc.status,
                    restrictionReason: statusDoc.reason,
                    restrictionUntil: statusDoc.until
                });
            }
        }
        
        // Native Discord Admin Check (0x8)
        const guild = req.user.guilds.find(g => g.id === process.env.DISCORD_GUILD_ID);
        const hasNativeAdmin = !!(guild && (guild.permissions & 0x8));

        // Bot Role Checks
        try {
            const botGuild = await require('../services/discordBot').getGuild();
            let hasAdminRole = false;
            let hasStaffRole = false;
            let hasOwnerRole = false;
            let isJuniorStaff = false;
            let isWisdomAgent = false;

            // Check if user is in Agent collection
            const agentDoc = await Agent.findOne({ userId: req.user.discordId });
            if (agentDoc) isWisdomAgent = true;

            if (botGuild) {
                const member = await botGuild.members.fetch(req.user.discordId).catch(() => null);
                if (member) {
                    if (process.env.OWNER_ROLE_ID && member.roles.cache.has(process.env.OWNER_ROLE_ID)) {
                        hasOwnerRole = true;
                    }
                    if (process.env.ADMINISTRATOR_ROLEID && member.roles.cache.has(process.env.ADMINISTRATOR_ROLEID)) {
                        hasAdminRole = true;
                    }
                    if (process.env.STAFFROLE_ID && member.roles.cache.has(process.env.STAFFROLE_ID)) {
                        hasStaffRole = true;
                    }
                    if (process.env.JUNIOR_STAFF_ROLEID && member.roles.cache.has(process.env.JUNIOR_STAFF_ROLEID)) {
                        isJuniorStaff = true;
                    }
                }
            }

            userObj.isOwner = hasOwnerRole;
            userObj.isAdmin = hasNativeAdmin || hasAdminRole || hasOwnerRole;
            userObj.isStaff = hasStaffRole || userObj.isAdmin;
            userObj.isJuniorStaff = isJuniorStaff || userObj.isStaff;
            userObj.isAgent = isWisdomAgent;

            res.json(userObj);
        } catch (err) {
            console.error('Error in /user role check:', err);
            res.json(userObj);
        }
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
});

// @route   GET /api/auth/logout
// @desc    Logout user
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ message: 'Logout failed' });
        res.json({ message: 'Logged out successfully' });
    });
});

module.exports = router;

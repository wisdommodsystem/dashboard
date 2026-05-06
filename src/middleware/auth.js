const { getGuild } = require('../services/discordBot');
const Agent = require('../models/Agent');
const StaffStatus = require('../models/StaffStatus');

const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};

const ensureAdmin = (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    // Check if user has admin permissions in the target guild
    // Discord permission for ADMINISTRATOR is 0x8
    const guild = req.user.guilds.find(g => g.id === process.env.DISCORD_GUILD_ID);
    
    if (guild && (guild.permissions & 0x8)) {
        return next();
    }
    
    res.status(403).json({ message: 'Forbidden: Admin access required' });
};

const ensureStaffOrAdmin = async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    // Check for Admin from OAuth
    const guild = req.user.guilds.find(g => g.id === process.env.DISCORD_GUILD_ID);
    if (guild && (guild.permissions & 0x8)) {
        return next(); // Has Admin
    }

    // Check for Staff or Junior Staff Roles using the bot directly
    try {
        const botGuild = await getGuild();
        if (botGuild) {
            const member = await botGuild.members.fetch(req.user.discordId).catch(() => null);
            if (member) {
                const isStaff = process.env.STAFFROLE_ID && member.roles.cache.has(process.env.STAFFROLE_ID);
                const isJuniorStaff = process.env.JUNIOR_STAFF_ROLEID && member.roles.cache.has(process.env.JUNIOR_STAFF_ROLEID);
                const isAdminRole = process.env.ADMINISTRATOR_ROLEID && member.roles.cache.has(process.env.ADMINISTRATOR_ROLEID);
                
                if (isStaff || isJuniorStaff || isAdminRole) {
                    return next();
                }
            }
        }
    } catch (err) {
        console.error('Error checking roles:', err);
    }
    
    res.status(403).json({ message: 'Forbidden: Missing required staff/admin permissions' });
};

const checkStaffStatus = async (req, res, next) => {
    if (!req.isAuthenticated()) return next();

    try {
        const status = await StaffStatus.findOne({ userId: req.user.discordId });
        if (status && status.status !== 'active') {
            // Check if rest period has ended
            if (status.status === 'resting' && status.until && new Date() > status.until) {
                // Period expired, auto-reactivate could be handled here or just ignore block
                return next();
            }
            
            return res.status(403).json({ 
                message: 'Account restricted', 
                staffStatus: status.status,
                reason: status.reason,
                until: status.until
            });
        }
    } catch (err) {
        console.error('Error checking staff status:', err);
    }
    next();
};

const ensureJuniorStaffOrAbove = async (req, res, next) => {
    return ensureStaffOrAdmin(req, res, next);
};

const ensureRoleAdmin = async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    // Check for Native Admin from OAuth
    const guild = req.user.guilds.find(g => g.id === process.env.DISCORD_GUILD_ID);
    if (guild && (guild.permissions & 0x8)) {
        return next(); // Has Native Admin
    }

    // Check for Administrator Role using the bot directly
    try {
        const botGuild = await getGuild();
        if (botGuild && process.env.ADMINISTRATOR_ROLEID) {
            const member = await botGuild.members.fetch(req.user.discordId).catch(() => null);
            if (member && member.roles.cache.has(process.env.ADMINISTRATOR_ROLEID)) {
                return next(); // Has Admin Role
            }
        }
    } catch (err) {
        console.error('Error checking admin role:', err);
    }
    
    res.status(403).json({ message: 'Forbidden: Administrator Role access required' });
};

const ensureOwner = async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    try {
        const botGuild = await getGuild();
        if (botGuild && process.env.OWNER_ROLE_ID) {
            const member = await botGuild.members.fetch(req.user.discordId).catch(() => null);
            if (member && member.roles.cache.has(process.env.OWNER_ROLE_ID)) {
                return next();
            }
        }
    } catch (err) {
        console.error('Error checking owner role:', err);
    }
    
    res.status(403).json({ message: 'Forbidden: Owner access required' });
};

const ensureAdminOrAgent = async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    // Check for Native Admin or Admin Role
    const guild = req.user.guilds.find(g => g.id === process.env.DISCORD_GUILD_ID);
    let isAdmin = (guild && (guild.permissions & 0x8));
    
    if (!isAdmin) {
        try {
            const botGuild = await getGuild();
            if (botGuild && process.env.ADMINISTRATOR_ROLEID) {
                const member = await botGuild.members.fetch(req.user.discordId).catch(() => null);
                if (member && member.roles.cache.has(process.env.ADMINISTRATOR_ROLEID)) {
                    isAdmin = true;
                }
            }
        } catch (err) {}
    }

    if (isAdmin) return next();

    // Check for Agent
    try {
        const agent = await Agent.findOne({ userId: req.user.discordId });
        if (agent) return next();
    } catch (err) {}
    
    res.status(403).json({ message: 'Forbidden: Admin or Wisdom Agent access required' });
};

module.exports = { 
    ensureAuthenticated, 
    ensureAdmin, 
    ensureStaffOrAdmin, 
    ensureRoleAdmin, 
    ensureAdminOrAgent, 
    ensureJuniorStaffOrAbove,
    ensureOwner,
    checkStaffStatus
};

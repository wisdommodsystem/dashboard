const Jail = require('../models/Jail');
const Log = require('../models/Log');
const { unjailMember } = require('./discordBot');

// Store active timeouts so we can cancel them if needed
const activeTimers = new Map();

/**
 * Auto-unjail a member when their jail time expires.
 */
const processUnjail = async (jailEntry) => {
    try {
        console.log(`[Jail Scheduler] Auto-unjailing ${jailEntry.username || jailEntry.userId}...`);

        // Perform unjail via Discord bot (restore roles + DM)
        const result = await unjailMember(jailEntry.userId, jailEntry.rolesBeforeJail, 'System (Auto)');

        if (result && !result.error) {
            // Update database
            jailEntry.isActive = false;
            jailEntry.unjailedBy = 'System (Auto)';
            jailEntry.unjailedAt = new Date();
            await jailEntry.save();

            // Log action
            await Log.create({
                action: 'Auto-Unjail',
                category: 'Jail',
                details: { username: jailEntry.username, reason: 'Jail duration expired' },
                moderatorId: 'SYSTEM',
                moderatorName: 'System (Auto)',
                targetId: jailEntry.userId,
                targetName: jailEntry.username
            });

            console.log(`[Jail Scheduler] ✅ ${jailEntry.username || jailEntry.userId} has been auto-unjailed.`);
        } else {
            console.error(`[Jail Scheduler] ❌ Failed to auto-unjail ${jailEntry.userId}:`, result?.error);
        }
    } catch (err) {
        console.error(`[Jail Scheduler] ❌ Error auto-unjailing ${jailEntry.userId}:`, err.message);
    } finally {
        // Remove from active timers
        activeTimers.delete(jailEntry._id.toString());
    }
};

/**
 * Schedule an unjail for a specific jail entry.
 */
const scheduleUnjail = (jailEntry) => {
    const entryId = jailEntry._id.toString();

    // Cancel any existing timer for this entry
    if (activeTimers.has(entryId)) {
        clearTimeout(activeTimers.get(entryId));
    }

    const now = Date.now();
    const expiresAt = new Date(jailEntry.expiresAt).getTime();
    const delay = expiresAt - now;

    if (delay <= 0) {
        // Already expired, process immediately
        console.log(`[Jail Scheduler] ${jailEntry.username || jailEntry.userId} jail already expired — processing now.`);
        processUnjail(jailEntry);
    } else {
        // Schedule for future
        const timer = setTimeout(() => processUnjail(jailEntry), delay);
        activeTimers.set(entryId, timer);

        const minutesLeft = Math.round(delay / 60000);
        console.log(`[Jail Scheduler] Scheduled auto-unjail for ${jailEntry.username || jailEntry.userId} in ${minutesLeft} minutes.`);
    }
};

/**
 * Cancel a scheduled unjail (e.g., when manually unjailed).
 */
const cancelScheduledUnjail = (jailEntryId) => {
    const entryId = jailEntryId.toString();
    if (activeTimers.has(entryId)) {
        clearTimeout(activeTimers.get(entryId));
        activeTimers.delete(entryId);
        console.log(`[Jail Scheduler] Cancelled scheduled unjail for entry ${entryId}`);
    }
};

/**
 * Initialize scheduler on server startup.
 * Loads all active jails and schedules their unjail timers.
 */
const initJailScheduler = async () => {
    try {
        const activeJails = await Jail.find({ isActive: true });
        console.log(`[Jail Scheduler] Found ${activeJails.length} active jail(s). Scheduling...`);

        for (const entry of activeJails) {
            scheduleUnjail(entry);
        }

        console.log('[Jail Scheduler] ✅ Jail scheduler initialized successfully.');
    } catch (err) {
        console.error('[Jail Scheduler] ❌ Failed to initialize:', err.message);
    }
};

module.exports = { initJailScheduler, scheduleUnjail, cancelScheduledUnjail };

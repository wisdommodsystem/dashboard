const express = require('express');
const router = express.Router();
const axios = require('axios');
const { ensureRoleAdmin } = require('../middleware/auth');
const { getGuild } = require('../services/discordBot');
const VerificationCache = require('../models/VerificationCache');

// @route   GET /api/verification/stats
// @desc    Get aggregated verification stats (Highly Resilient Edition)
router.get('/stats', ensureRoleAdmin, async (req, res) => {
    try {
        console.log('🔄 [Verification] Initializing secure synchronization...');
        
        let freshData = null;
        try {
            // Increase timeout to 60s for the first sync attempt
            const response = await axios.get(process.env.VERIFICATION_API_URL, {
                headers: {
                    'X-API-Key': process.env.VERIFICATION_API_KEY,
                    'Authorization': `Bearer ${process.env.VERIFICATION_API_KEY}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Connection': 'keep-alive'
                },
                timeout: 60000, 
                family: 4,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            if (response.data && response.data.success && response.data.data) {
                freshData = response.data.data;
                console.log('✅ [Verification] SUCCESS: Received fresh data package.');
            }
        } catch (apiErr) {
            console.warn(`⚠️ [Verification] Sync Delayed: ${apiErr.message}`);
        }

        let rawData = freshData;
        let isFromCache = false;

        if (!rawData) {
            const cachedDoc = await VerificationCache.findOne().sort({ lastUpdated: -1 });
            if (cachedDoc) {
                rawData = cachedDoc.data;
                isFromCache = true;
                console.log('📦 [Verification] Using persistent DB cache.');
            } else {
                return res.status(200).json({ 
                    totalVerified: 0, totalRejected: 0, ageGroup: {}, gender: {}, religion: {},
                    rolesAssigned: {}, adminStats: [], latestRecords: [],
                    apiError: true, 
                    message: '⏳ جارٍ جلب البيانات لأول مرة من السيرفر الخارجي.. يرجى الانتظار دقيقة وتحديث الصفحة.' 
                });
            }
        }

        // Heavy Processing Block (Resilient to huge data)
        const records = rawData.records || [];
        const processedData = {
            totalVerified: rawData.totalVerified || 0,
            totalRejected: rawData.totalRejected || 0,
            ageGroup: {}, gender: {}, religion: {}, rolesAssigned: {},
            adminStats: [], latestRecords: [],
            lastUpdated: rawData.lastUpdated || new Date()
        };

        const adminStatsRaw = {};
        records.forEach(rec => {
            if (rec.status === 'Verified') {
                if (rec.ageGroup) processedData.ageGroup[rec.ageGroup] = (processedData.ageGroup[rec.ageGroup] || 0) + 1;
                if (rec.gender) processedData.gender[rec.gender] = (processedData.gender[rec.gender] || 0) + 1;
                if (rec.religion) processedData.religion[rec.religion] = (processedData.religion[rec.religion] || 0) + 1;
            }
            if (rec.adminId) {
                if (!adminStatsRaw[rec.adminId]) adminStatsRaw[rec.adminId] = { verified: 0, rejected: 0, total: 0 };
                adminStatsRaw[rec.adminId].total++;
                if (rec.status === 'Verified') adminStatsRaw[rec.adminId].verified++;
                else if (rec.status === 'Rejected') adminStatsRaw[rec.adminId].rejected++;
            }
        });

        // Use Role Map
        if (rawData.roleMap) {
            records.forEach(rec => {
                if (rec.rolesAssigned) {
                    rec.rolesAssigned.forEach(roleId => {
                        const label = Object.keys(rawData.roleMap).find(key => rawData.roleMap[key] === roleId) || roleId;
                        processedData.rolesAssigned[label] = (processedData.rolesAssigned[label] || 0) + 1;
                    });
                }
            });
        }

        // Discord Integration (Deferred/Async)
        const botGuild = await getGuild();
        const adminMap = new Map();
        const adminIds = Object.keys(adminStatsRaw);

        if (botGuild && adminIds.length > 0) {
            try {
                const members = await botGuild.members.fetch({ user: adminIds.slice(0, 50) }).catch(() => null);
                if (members) members.forEach(m => adminMap.set(m.id, m));
            } catch (e) {}
        }

        processedData.adminStats = Object.entries(adminStatsRaw).map(([id, stats]) => {
            const m = adminMap.get(id);
            return { id, name: m ? m.displayName : 'Admin ' + id.slice(-4), avatar: m ? m.user.displayAvatarURL() : null, ...stats };
        }).sort((a,b) => b.total - a.total);

        processedData.latestRecords = records.slice(0, 15).map(r => ({
            username: r.username, status: r.status, date: r.verifiedAt || r.rejectedAt,
            adminName: adminMap.get(r.adminId)?.displayName || 'Admin'
        }));

        // CRITICAL: Save to DB Cache ONLY if we got fresh data
        if (freshData && !isFromCache) {
            await VerificationCache.findOneAndUpdate(
                {}, 
                { data: freshData, lastUpdated: new Date() }, 
                { upsert: true, returnDocument: 'after' }
            );
            console.log('💾 [Verification] DB Cache updated successfully.');
        }

        res.json({ 
            ...processedData, 
            cached: isFromCache, 
            message: isFromCache ? '⚠️ عرض بيانات مخزنة مؤقتاً.' : '✅ متصل ومحدث.'
        });

    } catch (err) {
        console.error('🛑 [Verification] Fatal:', err.message);
        res.status(200).json({ apiError: true, message: `تعذر الاتصال: ${err.message}` });
    }
});

module.exports = router;

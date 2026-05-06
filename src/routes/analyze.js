const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Temporary route to analyze DB
router.get('/analyze', async (req, res) => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        let report = [];
        
        for (let c of collections) {
            const count = await mongoose.connection.db.collection(c.name).countDocuments();
            const docs = await mongoose.connection.db.collection(c.name).find().limit(5).toArray();
            report.push({
                collection: c.name,
                documentCount: count,
                sampleData: docs
            });
        }
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

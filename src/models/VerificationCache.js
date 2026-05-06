const mongoose = require('mongoose');

const VerificationCacheSchema = new mongoose.Schema({
    data: {
        type: Object,
        required: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('VerificationCache', VerificationCacheSchema);

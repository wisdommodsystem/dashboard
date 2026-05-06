const mongoose = require('mongoose');

const WarnSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String },
    guildId: { type: String, required: true },
    reason: { type: String, required: true },
    moderatorId: { type: String, required: true },
    moderatorName: { type: String },
    warnedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    clearedBy: { type: String },
    clearedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Warn', WarnSchema);

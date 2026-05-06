const mongoose = require('mongoose');

const JailSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String },
    guildId: { type: String, required: true },
    reason: { type: String, required: true },
    jailedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    moderatorId: { type: String, required: true },
    moderatorName: { type: String },
    rolesBeforeJail: { type: Array, default: [] },
    isActive: { type: Boolean, default: true },
    unjailedBy: { type: String },
    unjailedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Jail', JailSchema);

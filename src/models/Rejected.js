const mongoose = require('mongoose');

const RejectedSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String },
    guildId: { type: String, required: true },
    reason: { type: String, required: true },
    moderatorId: { type: String, required: true },
    moderatorName: { type: String },
    rolesBeforeReject: { type: Array, default: [] },
    rejectedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    unrejectReason: { type: String },
    unrejectedBy: { type: String },
    unrejectedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Rejected', RejectedSchema);

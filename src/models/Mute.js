const mongoose = require('mongoose');

const MuteSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    displayName: { type: String },
    avatar: { type: String },
    reason: { type: String, required: true },
    duration: { type: Number, required: true }, // in minutes
    moderatorId: { type: String, required: true },
    moderatorName: { type: String, required: true },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Mute', MuteSchema);

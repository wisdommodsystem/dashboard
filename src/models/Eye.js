const mongoose = require('mongoose');

const EyeSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    avatar: { type: String },
    reason: { type: String, required: true },
    addedBy: { type: String },
    addedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Eye', EyeSchema);

const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    category: { type: String, required: true }, // e.g., 'Jail', 'Role', 'System'
    details: { type: Object },
    moderatorId: { type: String, required: true },
    moderatorName: { type: String },
    targetId: { type: String },
    targetName: { type: String },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Log', LogSchema);

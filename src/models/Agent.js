const mongoose = require('mongoose');

const AgentSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    avatar: { type: String },
    assignedDate: { type: Date, default: Date.now },
    notes: { type: String }
});

module.exports = mongoose.model('Agent', AgentSchema);

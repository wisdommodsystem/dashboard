const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    reason: { type: String, required: true },
    note: { type: String, required: true },
    moderatorId: { type: String, required: true },
    moderatorName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Note', NoteSchema);

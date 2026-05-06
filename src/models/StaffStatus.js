const mongoose = require('mongoose');

const staffStatusSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String },
    status: { 
        type: String, 
        enum: ['active', 'resting', 'dismissed'], 
        default: 'active' 
    },
    reason: { type: String, default: '' },
    until: { type: Date }, // Optional: end date for resting
    updatedBy: { type: String }, // ID of the Owner
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StaffStatus', staffStatusSchema);

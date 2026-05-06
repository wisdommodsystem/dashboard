const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    displayName: { type: String },
    email: { type: String },
    discriminator: { type: String },
    avatar: { type: String },
    accessToken: { type: String },
    refreshToken: { type: String },
    guilds: { type: Array },
    isAdmin: { type: Boolean, default: false },
    isMod: { type: Boolean, default: false },
    lastIp: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);

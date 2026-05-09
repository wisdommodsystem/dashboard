const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds', 'email'],
    passReqToCallback: true,
    proxy: true
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        if (!accessToken) {
            console.error('[Auth] Critical: No Access Token received from Discord');
        }
        console.log(`[Auth] Successful Token Exchange for: ${profile.username}`);
        
        let user = await User.findOne({ discordId: profile.id });
        
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        const userData = {
            discordId: profile.id,
            username: profile.username,
            displayName: profile.global_name || profile.username,
            email: profile.email,
            avatar: profile.avatar,
            accessToken,
            refreshToken,
            guilds: profile.guilds,
            lastIp: ip
        };

        if (user) {
            user = await User.findOneAndUpdate({ discordId: profile.id }, userData, { new: true });
        } else {
            user = await User.create(userData);
        }
        
        return done(null, user);
    } catch (err) {
        console.error('[Auth] Discord Strategy Error:', err);
        if (err.oauthError) {
            console.error('[Auth] OAuth Error Details:', err.oauthError);
        }
        return done(err, null);
    }
}));


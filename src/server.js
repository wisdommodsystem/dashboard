require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const mongoose = require('mongoose');
const passport = require('passport');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
require('./config/passport');

const app = express();

// Trust proxy to ensure req.ip contains the real IP address instead of localhost ::1
app.set('trust proxy', 1);

// Connect to Database
connectDB();

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // For development ease
}));

const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://panel.malahida.com',
    'http://localhost:5173',
    'http://localhost:5000'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1 && !allowedOrigins.includes(origin.replace(/\/$/, ""))) {
            return callback(new Error('Not allowed by CORS')); 
        }
        return callback(null, true);
    },
    credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// Session with MongoDB Store for production stability
app.use(session({
    secret: process.env.SESSION_SECRET || 'wisdom-circle-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 14 // 14 days
    }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/jail', require('./routes/jail'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/rejected', require('./routes/rejected'));
app.use('/api/warns', require('./routes/warns'));
app.use('/api/announce', require('./routes/announce'));
app.use('/api/moderation', require('./routes/moderation'));
app.use('/api/wisdom-agent', require('./routes/wisdomAgent'));
app.use('/api/junior-staff', require('./routes/juniorStaff'));
app.use('/api/db', require('./routes/analyze')); // Temporary
app.use('/api/dossier', require('./routes/dossier'));
app.use('/api/staff-stats', require('./routes/staffStats'));
app.use('/api/owner', require('./routes/owner'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/events', require('./routes/events'));

// Serve Frontend (Robust version for Express 5)
const frontendPath = path.join(__dirname, '../dist');

if (process.env.NODE_ENV === 'production' || require('fs').existsSync(frontendPath)) {
    console.log(`[Frontend] Serving from: ${frontendPath}`);
    app.use(express.static(frontendPath));

    // Catch-all middleware for React Routing (Instead of app.get to avoid Express 5 errors)
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api')) {
            return res.sendFile(path.join(frontendPath, 'index.html'));
        }
        next();
    });
} else {
    console.log("[Frontend] Running in dev mode");
}

const { initJailScheduler } = require('./services/jailScheduler');
const { client } = require('./services/discordBot');

const PORT = process.env.SERVER_PORT || process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    
    // Ensure Discord client is ready
    if (client.isReady()) {
        console.log('Discord Bot is already ready');
    } else {
        client.once('ready', () => {
            console.log('Discord Bot now ready for Dashboard stats');
        });
    }
    
    // Wait a bit for Discord bot to be fully settled, then initialize jail scheduler
    setTimeout(async () => {
        await initJailScheduler();
    }, 3000);
});

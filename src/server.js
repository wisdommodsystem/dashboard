const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
require('./config/passport');
require('dotenv').config();

const app = express();

// Trust proxy to ensure req.ip contains the real IP address instead of localhost ::1
app.set('trust proxy', 1);

// Connect to Database
connectDB();

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // For development ease
}));
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'wisdom-circle-secret',
    resave: false,
    saveUninitialized: true, // Set to true to ensure session is created
    cookie: {
        secure: false, // Set to false because we are using HTTP on the IP address
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
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

const PORT = process.env.SERVER_PORT || process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    
    // Wait a bit for Discord bot to be ready, then initialize jail scheduler
    setTimeout(async () => {
        await initJailScheduler();
    }, 3000);
});

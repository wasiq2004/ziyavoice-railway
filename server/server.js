const config = require('./config/envConfig.js');
﻿const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const path = require('path');
const mysqlPool = require('./config/database.js');
const nodeFetch = require('node-fetch');
const expressWs = require('express-ws');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

// Debug: Log environment startup
console.log('[STARTUP] 🔧 Environment loaded:');
console.log(`[STARTUP] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[STARTUP] APP_ENV: ${process.env.APP_ENV}`);
console.log(`[STARTUP] PORT: ${process.env.PORT}`);
console.log(`[STARTUP] BACKEND_BASE_URL: ${process.env.BACKEND_BASE_URL}`);
console.log(`[STARTUP] MYSQL_HOST: ${process.env.MYSQL_HOST}`);
console.log(`[STARTUP] SARVAM_API_KEY: ${process.env.SARVAM_API_KEY ? 'SET' : 'NOT SET'}`);
console.log(`[STARTUP] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET'}`);
console.log(`[STARTUP] OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
const twilio = require('twilio');
const fs = require('fs');
// Import services (STATIC classes)
const { ApiKeyService } = require('./services/apiKeyService.js');
const { ExternalApiService } = require('./services/externalApiService.js');
const { PhoneNumberService } = require('./services/phoneNumberService.js');
const AgentService = require('./services/agentService.js');
const CampaignService = require('./services/campaignService.js');
const { LLMService } = require('./llmService.js');
const CompanyService = require('./services/companyService.js');
const { AuthService } = require('./services/authService.js');
const TwilioService = require('./services/twilioService.js');
const { TwilioBasicService } = require('./services/twilioBasicService.js');
const { MediaStreamHandler } = require('./services/mediaStreamHandler.js');
const { ElevenLabsStreamHandler } = require('./services/elevenLabsStreamHandler.js');
const AdminService = require('./services/adminService.js');
const OrganizationService = require('./services/organizationService.js');
const WalletService = require('./services/walletService.js');
const CostCalculator = require('./services/costCalculator.js');
const VoiceSyncService = require('./services/voiceSyncService.js');
const VoiceWebSocketHandler = require('./services/voiceWebSocketHandler.js');
const { router: voiceRouter, initVoiceSync } = require('./routes/voiceRoutes.js');

// Google OAuth
const passport = require('passport');
const session = require('express-session');
const { configureGoogleAuth } = require('./config/googleAuth.js');
const { getBackendUrl, buildBackendUrl, normalizeBackendUrl, ensureHttpProtocol, buildBackendWsUrl } = require('./config/backendUrl.js');

// Initialize wallet and cost services
const walletService = new WalletService(mysqlPool);
const costCalculator = new CostCalculator(mysqlPool, walletService);

// Configure Google OAuth
const passportInstance = configureGoogleAuth(mysqlPool);

// Init server
const app = express();
app.locals.startupChecks = {
  ready: false,
  checkedAt: new Date().toISOString()
};
const PORT = Number(process.env.PORT) || 5000;
const server = require('http').createServer(app);
const expressWsInstance = expressWs(app, server, {
  wsOptions: {
    perMessageDeflate: false,
    clientTracking: true,
    maxPayload: 100 * 1024 * 1024,
    skipUTF8Validation: true 
  }
});
console.log(' WebSocket with skipUTF8Validation enabled');

const twilioCallWss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
  clientTracking: true,
  maxPayload: 100 * 1024 * 1024,
  skipUTF8Validation: true
});

// ============ CONSOLIDATED WEBSOCKET UPGRADE HANDLER ============
// CRITICAL: This is a SINGLE handler that consolidates what was previously two separate listeners
// Reason: Multiple server.on('upgrade') listeners cause race conditions and conflicts
server.on('upgrade', (req, socket, head) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // Only process Twilio media stream upgrade requests
  // Accept both /api/call and /api/call/.websocket (Twilio may append .websocket)
  const isValidCallPath = requestUrl.pathname === '/api/call' || requestUrl.pathname === '/api/call/.websocket';
  if (isValidCallPath) {
    console.log('ℹ️ Twilio WebSocket upgrade detected; deferring to express-ws route handling', {
      path: requestUrl.pathname,
      userAgent: req.headers['user-agent']?.substring(0, 50)
    });
    return;
  }

  if (!isValidCallPath) {
    return;
    console.log(`❌ WebSocket upgrade rejected: invalid path "${requestUrl.pathname}" (expected /api/call or /api/call/.websocket)`, {
      method: req.method,
      userAgent: req.headers['user-agent']?.substring(0, 50)
    });
    socket.write('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nInvalid WebSocket path');
    socket.destroy();
    return;
  }

  console.log('� WebSocket upgrade request for /api/call', {
    userAgent: req.headers['user-agent']?.substring(0, 50),
    'sec-websocket-key': req.headers['sec-websocket-key'] ? 'present' : 'MISSING'
  });

  try {
    // ✅ Validate required WebSocket headers
    if (req.headers.upgrade !== 'websocket' || !req.headers['sec-websocket-key']) {
      console.error('❌ Invalid WebSocket headers - rejecting upgrade');
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    // ✅ Check if MediaStreamHandler is initialized
    if (!mediaStreamHandler) {
      console.error('❌ MediaStreamHandler NOT initialized - rejecting upgrade', {
        timestamp: new Date().toISOString(),
        reason: 'Missing API keys (SARVAM_API_KEY or GEMINI_API_KEY)',
        suggestion: 'Verify environment variables and restart server'
      });
      socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nMediaStreamHandler not ready');
      socket.destroy();
      return;
    }

    // ✅ Handle the WebSocket upgrade
    console.log('✅ Processing WebSocket upgrade via twilioCallWss.handleUpgrade()');
    twilioCallWss.handleUpgrade(req, socket, head, (ws) => {
      console.log('✅ WebSocket upgrade completed, emitting connection event');
      twilioCallWss.emit('connection', ws, req);
    });

  } catch (error) {
    console.error('❌ Error during WebSocket upgrade:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    try {
      socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n');
    } catch (writeError) {
      console.error('Failed to send error response to socket');
    }
    socket.destroy();
  }
});

// ✅ Handle inbound socket connections (before they become WebSockets)
server.on('clientError', (err, socket) => {
  console.error('❌ Socket client error:', {
    message: err.message,
    code: err.code,
    timeSinceCreation: err.timeSinceCreation
  });
  if (socket.writable) {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  }
  socket.destroy();
});

// ADD THIS BLOCK HERE:
console.log('=== ENVIRONMENT CHECK ===');
console.log('APP_URL:', config.APP_URL);
console.log('NODE_ENV:', process.env.NODE_ENV || 'NOT SET');
console.log('PORT:', PORT);
console.log('========================');

// ✅ CRITICAL FIX: Declare API keys BEFORE using them
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
console.log('Deepgram API Key configured:', !!deepgramApiKey);
console.log('Gemini API Key configured:', !!geminiApiKey);
console.log('OpenAI API Key configured:', !!openaiApiKey);

// Instantiate ONLY services that require instances
const llmService = new LLMService(geminiApiKey, openaiApiKey, mysqlPool);
const campaignService = new CampaignService(mysqlPool, walletService, costCalculator, llmService);
const authService = new AuthService(mysqlPool);
const twilioService = new TwilioService();
const twilioBasicService = new TwilioBasicService();
const companyService = new CompanyService(mysqlPool);
const adminService = new AdminService(mysqlPool);
const organizationService = new OrganizationService(mysqlPool);
// Google Sheets service removed

// Initialize MediaStreamHandler for voice call pipeline
const agentService = new AgentService(mysqlPool);

// MediaStreamHandler will be initialized later in the file (see line ~2700)
let mediaStreamHandler;

function attachTwilioMediaStreamConnection(ws, req, source = 'express-ws') {
  const remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const connectionId = require('crypto').randomBytes(6).toString('hex');

  console.log(`🟢 [Conn: ${connectionId}] NEW WebSocket connection received`, {
    timestamp: new Date().toISOString(),
    remoteIp,
    url: req.url,
    source,
    mediaStreamHandlerReady: !!mediaStreamHandler
  });

  if (!mediaStreamHandler) {
    console.error(`🔴 [Conn: ${connectionId}] MediaStreamHandler NOT initialized - closing connection`, {
      reason: 'Missing API keys or handler initialization failed',
      suggestion: 'Check server logs during startup for initialization errors'
    });
    ws.close(1011, 'Service temporarily unavailable');
    return;
  }

  try {
    console.log(`✅ [Conn: ${connectionId}] Calling mediaStreamHandler.handleConnection()`);
    mediaStreamHandler.handleConnection(ws, req);
    console.log(`✅ [Conn: ${connectionId}] Connection successfully passed to mediaStreamHandler`);
  } catch (error) {
    console.error(`🔴 [Conn: ${connectionId}] Error in mediaStreamHandler.handleConnection():`, {
      message: error.message,
      stack: error.stack
    });
    ws.close(1011, 'Handler error');
  }
}

// ✅ ENHANCED Connection Listener with Detailed Logging
twilioCallWss.on('connection', (ws, req) => {
  return attachTwilioMediaStreamConnection(ws, req, 'custom-wss');
  const remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const connectionId = require('crypto').randomBytes(6).toString('hex');
  
  console.log(`🟢 [Conn: ${connectionId}] NEW WebSocket connection received`, {
    timestamp: new Date().toISOString(),
    remoteIp,
    url: req.url,
    mediaStreamHandlerReady: !!mediaStreamHandler
  });

  if (!mediaStreamHandler) {
    console.error(`🔴 [Conn: ${connectionId}] MediaStreamHandler NOT initialized - closing connection`, {
      reason: 'Missing API keys or handler initialization failed',
      suggestion: 'Check server logs during startup for initialization errors'
    });
    ws.close(1011, 'Service temporarily unavailable');
    return;
  }

  try {
    console.log(`✅ [Conn: ${connectionId}] Calling mediaStreamHandler.handleConnection()`);
    mediaStreamHandler.handleConnection(ws, req);
    console.log(`✅ [Conn: ${connectionId}] Connection successfully passed to mediaStreamHandler`);
  } catch (error) {
    console.error(`🔴 [Conn: ${connectionId}] Error in mediaStreamHandler.handleConnection():`, {
      message: error.message,
      stack: error.stack
    });
    ws.close(1011, 'Handler error');
  }
});

// ✅ Handle WebSocket server errors
twilioCallWss.on('error', (error) => {
  console.error('🔴 WebSocket Server Error:', {
    message: error.message,
    code: error.code,
    timestamp: new Date().toISOString()
  });
});

// Initialize Voice Sync Service
const voiceSyncService = new VoiceSyncService(mysqlPool);
const voiceWsHandler = new VoiceWebSocketHandler(voiceSyncService);
console.log(' Voice Sync Service initialized');

console.log(' WebSocket support enabled on HTTP server');

// Initialize Google Voice Stream Handler
const GoogleVoiceStreamHandler = require('./services/GoogleVoiceStreamHandler.js');
const googleVoiceHandler = new GoogleVoiceStreamHandler(voiceSyncService, walletService);
app.ws('/voice-stream-google', (ws, req) => {
  googleVoiceHandler.handleConnection(ws, req);
});
console.log(' Google Voice Stream Handler initialized at /voice-stream-google');

// Initialize Deepgram Browser Handler
const { DeepgramBrowserHandler } = require('./services/DeepgramBrowserHandler.js');
console.log('Deepgram API Key configured:', !!deepgramApiKey);
console.log('Gemini API Key configured:', !!geminiApiKey);
console.log('OpenAI API Key configured:', !!openaiApiKey);

let deepgramBrowserHandler;
if (deepgramApiKey) {
  try {
    deepgramBrowserHandler = new DeepgramBrowserHandler(deepgramApiKey, geminiApiKey, openaiApiKey, mysqlPool);
    app.ws('/voice-stream-deepgram', (ws, req) => {
      deepgramBrowserHandler.handleConnection(ws, req);
    });
    console.log('Deepgram Browser Handler initialized at /voice-stream-deepgram');
  } catch (error) {
    console.error('Failed to initialize DeepgramBrowserHandler:', error.message);
  }
} else {
  console.warn(' DeepgramBrowserHandler not initialized (missing API keys)');
}

// Initialize BrowserVoiceHandler for production-level browser voice interactions
const { BrowserVoiceHandler } = require('./services/BrowserVoiceHandler.js');
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const sarvamApiKey = process.env.SARVAM_API_KEY;

let browserVoiceHandler;
// Initialize if Sarvam API key is available
if (sarvamApiKey) {
  try {
    browserVoiceHandler = new BrowserVoiceHandler(
      geminiApiKey,
      openaiApiKey,
      elevenLabsApiKey,
      sarvamApiKey,
      mysqlPool
    );
    app.ws('/browser-voice-stream', (ws, req) => {
      browserVoiceHandler.handleConnection(ws, req);
    });
    console.log(' Browser Voice Handler initialized at /browser-voice-stream');
    console.log('   - Sarvam STT:');
    console.log('   - Gemini LLM: ' + (geminiApiKey ? '' : ''));
    console.log('   - ElevenLabs TTS: ' + (elevenLabsApiKey ? '' : ''));
  } catch (error) {
    console.error('Failed to initialize BrowserVoiceHandler:', error.message);
  }
} else {
  console.warn(' BrowserVoiceHandler not initialized (missing SARVAM_API_KEY)');
}

// === ADD THIS BLOCK ===
if (!process.env.ELEVEN_LABS_API_KEY) {
  console.warn("WARNING: ELEVEN_LABS_API_KEY is not configured. Text-to-speech will not work.");
} else {
  console.log("ElevenLabs API key loaded successfully");
}
console.log("Twilio Basic Service initialized");
// ================= CORS ==================
const FRONTEND_URL = process.env.FRONTEND_URL;

const corsOptions = {
  origin: (origin, callback) => {
    const allowed = [
      FRONTEND_URL,
      'https://ziyasuite.netlify.app',
      'https://ziyasuite.com'
    ];

    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      const err = new Error('CORS policy: origin not allowed');
      err.status = 403;
      callback(err, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// explicitly support OPTIONS for login (preflight)
app.options('/api/auth/login', cors(corsOptions), (req, res) => res.sendStatus(204));

// Keep request logging focused on Twilio and voice pipeline traffic.
app.use((req, res, next) => {
  const url = req.originalUrl || req.url || '';
  const shouldLog =
    url.includes('/api/twilio') ||
    url.includes('/api/call') ||
    url.includes('/voice-stream') ||
    url.includes('/browser-voice-stream');

  if (!shouldLog) {
    next();
    return;
  }

  console.log(`[REQ] ${req.method} ${url} - origin: ${req.headers.origin || 'none'} - ip: ${req.ip}`);
  res.on('finish', () => {
    console.log(`[RESP] ${req.method} ${url} -> ${res.statusCode}`);
  });
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Twilio webhooks are defined later in the file (see line ~2170)

// Initialize and mount voice routes
app.use('/api/voices', initVoiceSync(mysqlPool));
console.log(' Voice API routes mounted at /api/voices');


// ==================== SESSION & GOOGLE OAUTH ====================

// MySQL Session Store (production-ready)
const MySQLStore = require('express-mysql-session')(session);
const sessionStore = new MySQLStore({
  clearExpired: true,
  checkExpirationInterval: 900000, // 15 minutes
  expiration: 86400000, // 24 hours
  createDatabaseTable: true,
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
}, mysqlPool);

// Session middleware (required for Passport)
app.use(session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Routes
app.get('/api/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' }),
  (req, res) => {
    // Successful authentication
    const user = req.user;
    console.log(' Google OAuth successful for:', user.email);

    // Redirect to frontend with user data
    const frontendUrl = process.env.FRONTEND_URL;
    res.redirect(`${frontendUrl}/login?user=${encodeURIComponent(JSON.stringify(user))}`);
  }
);

// Logout route
app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

console.log(' Google OAuth routes configured');

// Initialize and mount call routes
const callRoutes = require('./routes/callRoutes.js');
app.set('mysqlPool', mysqlPool); // Make pool available to routes
app.use('/api/calls', callRoutes);
console.log(' Call API routes mounted at /api/calls');

const documentRoutes = require('./routes/documentRoutes.js')(mysqlPool);
app.use('/api/documents', documentRoutes);
console.log(' Document API routes mounted at /api/documents');

// Initialize and mount company routes
const companyRoutes = require('./routes/companyRoutes.js')(companyService);
app.use('/api/companies', companyRoutes);
console.log(' Company API routes mounted at /api/companies');

// ==================== NEW API ARCHITECTURE ====================
// Mount Health Check Routes (V1)
const healthRoutes = require('./routes/healthRoutes.js');
app.use('/api/health', healthRoutes);
console.log(' Health check routes mounted at /api/health');

// Mount V1 Routes (Versioned API)
const { initializeV1Routes } = require('./routes/v1');
const v1Routes = initializeV1Routes({
  authService,
  mysqlPool,
  walletService,
  campaignService,
  adminService,
  organizationService,
  companyService
});
app.use('/api/v1', v1Routes);
console.log('V1 API routes mounted at /api/v1');

// Mount V2 Routes (Scaffold/Future)
const { router: v2Router } = require('./routes/v2');
app.use('/api/v2', v2Router);
console.log('V2 API scaffold mounted at /api/v2 (ready for future features)');
// =========================================================

// Trigger initial voice sync
voiceSyncService.syncAllProviders()
  .then(result => {
    console.log(` Initial voice sync complete: ${result.synced} voices synced`);
    if (result.errors.length > 0) {
      console.warn(' Voice sync errors:', result.errors);
    }
  })
  .catch(err => console.error('âŒ Initial voice sync failed:', err.message));

// Get user wallet balance
app.get('/api/wallet/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || userId === 'null' || userId === 'undefined') {
      return res.json({ success: true, balance: 0, currency: 'USD' });
    }

    const balance = await walletService.getBalance(userId);

    res.json({
      success: true,
      balance: balance,
      currency: 'USD'
    });
  } catch (error) {
    // Silently return 0 for non-existent users (e.g., admin impersonation sessions)
    if (error.message && error.message.includes('User not found')) {
      return res.json({ success: true, balance: 0, currency: 'USD' });
    }
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get wallet transactions
app.get('/api/wallet/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const transactions = await walletService.getTransactions(userId, limit, offset);

    res.json({
      success: true,
      transactions: transactions
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get usage statistics
app.get('/api/wallet/usage-stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const stats = await walletService.getUsageStats(userId, startDate, endDate);

    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get service pricing
app.get('/api/wallet/pricing', async (req, res) => {
  try {
    const pricing = await walletService.getServicePricing();

    res.json({
      success: true,
      pricing: pricing
    });
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ADMIN WALLET ENDPOINTS ====================

// Add credits to user wallet (admin only)
// Accepts amount in INR; converts to Credits internally
app.post('/api/admin/wallet/add-credits', async (req, res) => {
  try {
    const { userId, amount, description, adminId } = req.body; // amount is in INR

    if (!userId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'User ID and amount (INR) are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // walletService.addCredits now accepts INR and converts to Credits
    const result = await walletService.addCredits(
      userId,
      amount,
      description || `Admin added â‚¹${amount} INR`,
      adminId
    );

    // Log admin activity with INR + credits info
    adminService.logActivity(
      adminId,
      'add_wallet_credits',
      userId,
      `Added â‚¹${amount} INR (â‰ˆ${result.creditsAdded} Credits) to wallet. Reason: ${description || 'N/A'}`,
      req.ip
    );

    res.json({
      success: true,
      newBalance: result.newBalance,
      creditsAdded: result.creditsAdded,
      inrAmount: parseFloat(amount),
      transaction: result.transaction
    });
  } catch (error) {
    console.error('Error adding credits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Deduct credits from user wallet (admin only)
app.post('/api/admin/wallet/deduct-credits', async (req, res) => {
  try {
    const { userId, amount, description, adminId } = req.body;

    if (!userId || !amount || !adminId) {
      return res.status(400).json({
        success: false,
        message: 'User ID, amount, and admin ID are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    const result = await walletService.deductCredits(
      userId,
      amount,
      'admin_adjustment',
      description || 'Admin debit adjustment',
      null,
      { adjusted_by: adminId }
    );

    // Log admin activity
    adminService.logActivity(
      adminId,
      'deduct_wallet_credits',
      userId,
      `Deducted $${amount} from wallet. Reason: ${description || 'N/A'}`,
      req.ip
    );

    res.json({
      success: true,
      newBalance: result.newBalance,
      transaction: result.transaction
    });
  } catch (error) {
    console.error('Error deducting credits:', error);

    if (error.message === 'Insufficient balance') {
      return res.status(400).json({
        success: false,
        message: 'User has insufficient balance'
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
});

// Update service pricing (admin only)
app.post('/api/admin/wallet/update-pricing', async (req, res) => {
  try {
    const { serviceType, costPerUnit, adminId } = req.body;

    if (!serviceType || !costPerUnit || !adminId) {
      return res.status(400).json({
        success: false,
        message: 'Service type, cost per unit, and admin ID are required'
      });
    }

    if (!['elevenlabs', 'deepgram', 'gemini'].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service type'
      });
    }

    await walletService.updatePricing(serviceType, costPerUnit, adminId);

    // Log admin activity
    adminService.logActivity(
      adminId,
      'update_service_pricing',
      null,
      `Updated ${serviceType} pricing to $${costPerUnit} per unit`,
      req.ip
    );

    res.json({ success: true, message: 'Pricing updated successfully' });
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all users wallet balances (admin only)
app.get('/api/admin/wallet/all-balances', async (req, res) => {
  try {
    const [wallets] = await mysqlPool.execute(`
      SELECT 
        uw.user_id, 
        u.username, 
        u.email, 
        uw.balance, 
        uw.updated_at
      FROM user_wallets uw
      JOIN users u ON uw.user_id = u.id
      ORDER BY uw.balance DESC
    `);

    res.json({
      success: true,
      wallets: wallets.map(w => ({
        userId: w.user_id,
        username: w.username,
        email: w.email,
        balance: parseFloat(w.balance),
        lastUpdated: w.updated_at
      }))
    });
  } catch (error) {
    console.error('Error fetching all wallet balances:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// -----------------------------------------------

// NOTE: Support ticket endpoints defined at line ~2729 (Implementation #2)
// Uses crypto.randomBytes() for ID generation, compatible with V1 routes
// Features: Full role-based filtering, pagination, single ticket get, stats endpoint

// ==================== ADMIN USER MANAGEMENT ENDPOINTS ====================

// GET /api/admin/users” list users scoped to org (or all for super admin)
app.get('/api/admin/users', async (req, res) => {
  try {
    const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const search = Array.isArray(req.query.search) ? req.query.search[0] : (req.query.search || '');
    const rawOrgId = Array.isArray(req.query.orgId) ? req.query.orgId[0] : req.query.orgId;
    const page = parseInt(rawPage) || 1;
    const limit = parseInt(rawLimit) || 50;
    const orgId = rawOrgId && rawOrgId !== 'null' ? parseInt(rawOrgId) : null;
    const result = await adminService.getAllUsers(page, limit, search, orgId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/users/:userId” single user detail including wallet_balance
app.get('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const data = await adminService.getUserDetails(userId);
    // Attach live wallet balance
    const wallet = await walletService.getOrCreateWallet(userId).catch(() => null);
    if (data.user && wallet) {
      data.user.wallet_balance = parseFloat(wallet.balance || '0');
    }
    // Normalise limits from array to object keyed by service_name
    const limitsMap = {};
    if (Array.isArray(data.limits)) {
      data.limits.forEach(l => { limitsMap[l.service_name] = l; });
    }
    res.json({ success: true, user: data.user, limits: limitsMap, usage: data.usage, billing: data.billing });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/users/:userId” permanently delete a user (org-scoped)
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminId } = req.body;
    // Ensure the user exists and is a regular user (not another admin)
    const [rows] = await mysqlPool.execute("SELECT id, role FROM users WHERE id = ? AND role = 'user'", [userId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    // Cascade delete
    await mysqlPool.execute('DELETE FROM user_wallets WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM wallet_transactions WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM user_service_limits WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM user_service_usage WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM agents WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM campaigns WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM users WHERE id = ?', [userId]);
    if (adminId) {
      adminService.logActivity(adminId, 'delete_user', userId, 'User permanently deleted', null);
    }
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/admin/users/:userId/status” block or unblock user
app.put('/api/admin/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, adminId } = req.body;
    if (!['active', 'locked', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }
    const result = await adminService.updateUserStatus(userId, status, adminId);
    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/wallet/summary?orgId=X” org-level credit KPIs
app.get('/api/admin/wallet/summary', async (req, res) => {
  try {
    const { orgId } = req.query;
    let userFilter = "WHERE u.role = 'user'";
    const params = [];
    if (orgId) { userFilter += ' AND u.organization_id = ?'; params.push(parseInt(orgId)); }
    const [[totals]] = await mysqlPool.execute(`
      SELECT
        COUNT(DISTINCT u.id) AS totalUsers,
        COALESCE(SUM(uw.balance), 0) AS totalBalance,
        COALESCE((SELECT SUM(wt.amount) FROM wallet_transactions wt JOIN users u2 ON u2.id = wt.user_id ${orgId ? "AND u2.organization_id = ?" : ""} WHERE wt.transaction_type = 'debit'), 0) AS totalDebited,
        COALESCE((SELECT SUM(wt.amount) FROM wallet_transactions wt JOIN users u2 ON u2.id = wt.user_id ${orgId ? "AND u2.organization_id = ?" : ""} WHERE wt.transaction_type = 'credit'), 0) AS totalCredited
      FROM users u
      LEFT JOIN user_wallets uw ON uw.user_id = u.id
      ${userFilter}
    `, orgId ? [...params, parseInt(orgId), parseInt(orgId)] : []);
    res.json({ success: true, summary: totals });
  } catch (error) {
    console.error('Error fetching wallet summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/wallet/transactions?orgId=X” org-level transaction log
app.get('/api/admin/wallet/transactions', async (req, res) => {
  try {
    const { orgId, limit = 100, type } = req.query;
    let where = "WHERE u.role = 'user'";
    const params = [];
    if (orgId) { where += ' AND u.organization_id = ?'; params.push(parseInt(orgId)); }
    if (type && type !== 'All') { where += ' AND wt.transaction_type = ?'; params.push(type === 'Purchased' ? 'credit' : 'debit'); }
    const [transactions] = await mysqlPool.execute(`
      SELECT wt.*, u.username, u.email
      FROM wallet_transactions wt
      JOIN users u ON u.id = wt.user_id
      ${where}
      ORDER BY wt.created_at DESC
      LIMIT ${parseInt(limit)}
    `, params);
    res.json({ success: true, transactions });
  } catch (error) {
    console.error('Error fetching org wallet transactions:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/impersonate/:userId” get user profile for impersonation
app.get('/api/admin/users/:userId/impersonate', async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminId } = req.query;
    const result = await adminService.getImpersonateUser(userId, adminId);
    res.json({ success: true, user: result });
  } catch (error) {
    console.error('Error impersonating user:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/logs?orgId=X” audit logs
app.get('/api/admin/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, orgId } = req.query;
    const result = await adminService.getAuditLogs(parseInt(page), parseInt(limit), orgId || null);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/stats” dashboard statistics
app.get('/api/admin/stats', async (req, res) => {
  try {
    const { orgId } = req.query;
    const stats = await adminService.getDashboardStats(orgId || null);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/users/:userId/resources” user agents + campaigns
app.get('/api/admin/users/:userId/resources', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await adminService.getUserResources(userId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching user resources:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/users/:userId/companies - user companies list
app.get('/api/admin/users/:userId/companies', async (req, res) => {
  try {
    const { userId } = req.params;
    const [companies] = await mysqlPool.execute(
      'SELECT id, name FROM companies WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json({ success: true, companies });
  } catch (error) {
    console.error('Error fetching user companies:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/users/:userId/login-as-company - admin login as user with specific company
app.post('/api/admin/users/:userId/login-as-company', async (req, res) => {
  try {
    const { userId } = req.params;
    const { companyId, adminId } = req.body;
    
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID is required' });
    }
    
    // Verify the company belongs to the user
    const [companies] = await mysqlPool.execute(
      'SELECT id FROM companies WHERE id = ? AND user_id = ?',
      [companyId, userId]
    );
    
    if (companies.length === 0) {
      return res.status(403).json({ success: false, message: 'Company not found or unauthorized' });
    }
    
    // Fetch user details
    const [users] = await mysqlPool.execute(
      'SELECT id, email, username, password_hash, role, status, organization_id FROM users WHERE id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = users[0];
    const returnUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      organization_id: user.organization_id,
      current_company_id: companyId
    };
    
    // Log admin activity
    if (adminId) {
      adminService.logActivity(adminId, 'user_company_login', userId, `Logged in as ${user.email} in company ${companyId}`, null);
    }
    
    res.json({ success: true, user: returnUser });
  } catch (error) {
    console.error('Error logging in as company:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/users/:userId/reset-password
app.post('/api/admin/users/:userId/reset-password', async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword, adminId } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const result = await adminService.resetUserPassword(userId, newPassword, adminId);
    res.json(result);
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/users/:userId/service-limits” set service limit
app.post('/api/admin/users/:userId/service-limits', async (req, res) => {
  try {
    const { userId } = req.params;
    const { serviceName, monthlyLimit, dailyLimit, isEnabled, adminId } = req.body;
    await adminService.setServiceLimit(userId, serviceName, monthlyLimit, dailyLimit, isEnabled, adminId);
    res.json({ success: true, message: 'Service limit updated' });
  } catch (error) {
    console.error('Error setting service limit:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/billing/:billingId/status” update billing status
app.post('/api/admin/billing/:billingId/status', async (req, res) => {
  try {
    const { billingId } = req.params;
    const { status, notes, adminId } = req.body;
    await adminService.updateBillingStatus(billingId, status, notes || '');
    if (adminId) adminService.logActivity(adminId, 'update_billing_status', null, `Updated billing ${billingId} to ${status}`, null);
    res.json({ success: true, message: 'Billing status updated' });
  } catch (error) {
    console.error('Error updating billing status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/create-user” create user under org (org-scoped)
app.post('/api/admin/create-user', async (req, res) => {
  try {
    const { email, username, password, organization_id } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ success: false, message: 'Email, username, and password are required' });
    }
    // Check uniqueness
    const [existing] = await mysqlPool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ success: false, message: 'Email already in use' });
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = require('crypto').randomBytes(8).toString('hex');
    await mysqlPool.execute(
      `INSERT INTO users (id, email, username, password_hash, role, organization_id, status) VALUES (?, ?, ?, ?, 'user', ?, 'active')`,
      [userId, email, username, passwordHash, organization_id || 5]
    );
    // Give them a wallet
    await walletService.getOrCreateWallet(userId).catch(() => {});
    const [rows] = await mysqlPool.execute('SELECT id, email, username, role, status, created_at, organization_id FROM users WHERE id = ?', [userId]);
    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// -----------------------------------------------
// For Twilio webhook form data

// Health check endpoint for Railway
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// API Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
// Add this to server.js right after the health check endpoint

app.get('/api/voice-config-check', (req, res) => {
  const config = {
    timestamp: new Date().toISOString(),
    checks: {
      sarvam: {
        configured: !!process.env.SARVAM_API_KEY,
        keyPreview: process.env.SARVAM_API_KEY
          ? process.env.SARVAM_API_KEY.substring(0, 8) + '...'
          : 'NOT SET',
        note: 'Used for STT in phone call pipeline'
      },
      gemini: {
        configured: !!process.env.GEMINI_API_KEY,
        keyPreview: process.env.GEMINI_API_KEY
          ? process.env.GEMINI_API_KEY.substring(0, 8) + '...'
          : 'NOT SET'
      },
      elevenlabs: {
        configured: !!process.env.ELEVEN_LABS_API_KEY,
        keyPreview: process.env.ELEVEN_LABS_API_KEY
          ? process.env.ELEVEN_LABS_API_KEY.substring(0, 8) + '...'
          : 'NOT SET'
      },
      appUrl: {
        configured: !!config.APP_URL,
        value: config.APP_URL,
        isPublic: config.APP_URL &&
          !config.APP_URL.includes('localhost') &&
          !config.APP_URL.includes('127.0.0.1')
      },
      mediaStreamHandler: {
        initialized: !!mediaStreamHandler,
        status: mediaStreamHandler ? 'READY' : 'NOT INITIALIZED (missing API keys)'
      }
    }
  };
  // Add these endpoints RIGHT AFTER the /api/voice-config-check endpoint in server.js

  // Test ElevenLabs API key freshness
  app.get('/api/test-elevenlabs-key', async (req, res) => {
    try {
      const key1 = process.env.ELEVEN_LABS_API_KEY;
      const key2 = process.env.ELEVEN_LABS_API_KEY;

      const result = {
        timestamp: new Date().toISOString(),
        keys: {
          ELEVEN_LABS_API_KEY: {
            exists: !!key1,
            preview: key1 ? `${key1.substring(0, 8)}...` : 'NOT SET',
            length: key1 ? key1.length : 0
          },
          ELEVEN_LABS_API_KEY: {
            exists: !!key2,
            preview: key2 ? `${key2.substring(0, 8)}...` : 'NOT SET',
            length: key2 ? key2.length : 0
          }
        }
      };

      // Test the key with ElevenLabs API
      const testKey = key1 || key2;
      if (testKey) {
        try {
          const testResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': testKey }
          });

          result.apiTest = {
            status: testResponse.status,
            ok: testResponse.ok,
            message: testResponse.ok ? 'API key is valid ' : 'API key is invalid âŒ'
          };
        } catch (error) {
          result.apiTest = {
            error: error.message,
            message: 'Failed to test API key âŒ'
          };
        }
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Test WebSocket connection path
  app.get('/api/test-websocket-path', (req, res) => {
    const appUrl = config.APP_URL;
    const twilioWsBaseUrl = process.env.TWILIO_WS_BASE_URL || process.env.BACKEND_WS_BASE_URL || appUrl;
    const websocketUrl = !appUrl
      ? 'NOT SET'
      : buildBackendWsUrl('/api/call', twilioWsBaseUrl);

    res.json({
      timestamp: new Date().toISOString(),
      appUrl: appUrl,
      twilioWsBaseUrl,
      websocketUrl,
      expectedFormat: 'wss://your-domain.railway.app/api/call?callId=xxx&agentId=xxx&contactId=xxx',
      registeredEndpoints: {
        '/api/call': 'WebSocket handler for Twilio media streams ',
        '/voice-stream': 'WebSocket handler for frontend voice chat '
      },
      instructions: 'Make sure Twilio TwiML uses this exact WebSocket URL format'
    });
  });

  // Test complete voice pipeline
  app.post('/api/test-voice-pipeline', async (req, res) => {
    try {
      const { text, voiceId } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text parameter required' });
      }

      const testVoiceId = voiceId || '21m00Tcm4TlvDq8ikWAM';
      const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVEN_LABS_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          error: 'ElevenLabs API key not configured',
          fix: 'Set ELEVEN_LABS_API_KEY or ELEVEN_LABS_API_KEY in Railway environment variables'
        });
      }

      console.log(`Testing TTS with key: ${apiKey.substring(0, 8)}...`);

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${testVoiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/basic'
          },
          body: JSON.stringify({
            text: text,
            model_id: 'eleven_turbo_v2_5',
            output_format: 'ulaw_8000'
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          error: 'ElevenLabs API error',
          status: response.status,
          details: errorText,
          keyUsed: `${apiKey.substring(0, 8)}...`
        });
      }

      const audioBuffer = await response.buffer();

      res.json({
        success: true,
        audioSize: audioBuffer.length,
        audioFormat: 'ulaw_8000',
        voiceId: testVoiceId,
        keyUsed: `${apiKey.substring(0, 8)}...`,
        message: 'Voice pipeline is working correctly '
      });

    } catch (error) {
      res.status(500).json({
        error: error.message,
        stack: error.stack
      });
    }
  });
  // Determine overall status
  const allConfigured =
    config.checks.sarvam.configured &&
    config.checks.gemini.configured &&
    config.checks.elevenlabs.configured &&
    config.checks.appUrl.configured &&
    config.checks.appUrl.isPublic &&
    config.checks.mediaStreamHandler.initialized;

  config.overallStatus = allConfigured ? 'READY ' : 'NOT READY âŒ';
  config.readyToMakeCalls = allConfigured;

  // Add missing items
  const missing = [];
  if (!config.checks.sarvam.configured) missing.push('SARVAM_API_KEY (required for phone call STT)');
  if (!config.checks.gemini.configured) missing.push('GEMINI_API_KEY');
  if (!config.checks.elevenlabs.configured) missing.push('ELEVEN_LABS_API_KEY');
  if (!config.checks.appUrl.configured) missing.push('APP_URL');
  if (config.checks.appUrl.configured && !config.checks.appUrl.isPublic) {
    missing.push('APP_URL must be public (not localhost)');
  }

  if (missing.length > 0) {
    config.missingConfiguration = missing;
    config.instructions = 'Configure missing environment variables in Railway dashboard';
  }

  res.json(config);
});

// Add this diagnostic endpoint too
app.get('/api/test-voice-pipeline', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  // Test 1: Check if MediaStreamHandler exists
  results.tests.mediaStreamHandler = {
    exists: !!mediaStreamHandler,
    canCreateSession: false
  };

  if (mediaStreamHandler) {
    try {
      // Test session creation (without actually connecting)
      const testSession = {
        callId: 'test-123',
        agentPrompt: 'Test prompt',
        agentVoiceId: '21m00Tcm4TlvDq8ikWAM',
        ws: null // Mock WS
      };
      results.tests.mediaStreamHandler.canCreateSession = true;
    } catch (err) {
      results.tests.mediaStreamHandler.error = err.message;
    }
  }

  // Test 2: Check Sarvam STT (phone call pipeline)
  results.tests.sarvam = {
    configured: !!process.env.SARVAM_API_KEY,
    keyLength: process.env.SARVAM_API_KEY ? process.env.SARVAM_API_KEY.length : 0,
    note: 'Sarvam STT is used for phone call transcription'
  };

  // Test 3: Check Gemini
  results.tests.gemini = {
    configured: !!process.env.GEMINI_API_KEY,
    keyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0
  };

  // Test 4: Check ElevenLabs
  const elevenLabsKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVEN_LABS_API_KEY;
  results.tests.elevenlabs = {
    configured: !!elevenLabsKey,
    keyLength: elevenLabsKey ? elevenLabsKey.length : 0
  };

  // Test 5: Test ElevenLabs TTS (optional - only if configured)
  if (elevenLabsKey) {
    try {
      const testTTS = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
        {
          method: 'POST',
          headers: {
            'xi-api-key': elevenLabsKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: 'Test',
            model_id: 'eleven_turbo_v2_5',
            output_format: 'ulaw_8000'
          })
        }
      );

      results.tests.elevenlabs.apiWorking = testTTS.ok;
      results.tests.elevenlabs.apiStatus = testTTS.status;

      if (!testTTS.ok) {
        const errorText = await testTTS.text();
        results.tests.elevenlabs.apiError = errorText.substring(0, 200);
      }
    } catch (err) {
      results.tests.elevenlabs.apiError = err.message;
    }
  }

  // Overall assessment
  const allPassed =
    results.tests.mediaStreamHandler.exists &&
    results.tests.sarvam.configured &&
    results.tests.gemini.configured &&
    results.tests.elevenlabs.configured &&
    (!results.tests.elevenlabs.apiWorking || results.tests.elevenlabs.apiWorking === true);

  results.overallStatus = allPassed ? 'ALL TESTS PASSED ' : 'SOME TESTS FAILED âŒ';
  results.readyForCalls = allPassed;

  res.json(results);
});

// Test Deepgram API key
app.get('/api/test-deepgram-key', async (req, res) => {
  try {
    const deepgramKey = process.env.DEEPGRAM_API_KEY;

    const result = {
      timestamp: new Date().toISOString(),
      keyInfo: {
        exists: !!deepgramKey,
        preview: deepgramKey ? `${deepgramKey.substring(0, 10)}...` : 'NOT SET',
        length: deepgramKey ? deepgramKey.length : 0
      }
    };

    if (!deepgramKey) {
      return res.json({
        ...result,
        status: 'ERROR',
        message: 'DEEPGRAM_API_KEY not configured in Railway environment variables'
      });
    }

    // Test the key with Deepgram API
    try {
      const testResponse = await fetch('https://api.deepgram.com/v1/projects', {
        method: 'GET',
        headers: {
          'Authorization': `Token ${deepgramKey}`,
          'Content-Type': 'application/json'
        }
      });

      result.apiTest = {
        status: testResponse.status,
        statusText: testResponse.statusText,
        ok: testResponse.ok
      };

      if (testResponse.ok) {
        const data = await testResponse.json();
        result.apiTest.message = ' API key is VALID and working!';
        result.apiTest.projectsFound = data.projects ? data.projects.length : 0;
        result.status = 'SUCCESS';
      } else {
        const errorText = await testResponse.text();
        result.apiTest.message = 'âŒ API key is INVALID or EXPIRED';
        result.apiTest.error = errorText;
        result.status = 'FAILED';
        result.recommendation = 'Create a new API key at https://console.deepgram.com/ and update DEEPGRAM_API_KEY in Railway';
      }
    } catch (error) {
      result.apiTest = {
        error: error.message,
        message: 'âŒ Failed to connect to Deepgram API'
      };
      result.status = 'ERROR';
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// Authentication endpoints
// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await authService.authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Check account status
    if (user.status && user.status !== 'active') {
      const reason = user.status === 'locked' ? 'account is locked' : 'account is inactive';
      return res.status(403).json({ success: false, message: `Access denied: Your ${reason}` });
    }

    // Default company check
    if (!user.current_company_id) {
      const [companies] = await mysqlPool.execute('SELECT id FROM companies WHERE user_id = ?', [user.id]);
      if (companies.length === 0) {
        const companyId = uuidv4();
        await mysqlPool.execute('INSERT INTO companies (id, user_id, name) VALUES (?, ?, ?)', [companyId, user.id, 'Default Company']);
        await mysqlPool.execute('UPDATE users SET current_company_id = ? WHERE id = ?', [companyId, user.id]);
        user.current_company_id = companyId;
      } else {
        await mysqlPool.execute('UPDATE users SET current_company_id = ? WHERE id = ?', [companies[0].id, user.id]);
        user.current_company_id = companies[0].id;
      }
    }

    // Attach plan info so frontend can show trial banners
    const [planRows] = await mysqlPool.execute(
      'SELECT plan_type, plan_valid_until, trial_started_at FROM users WHERE id = ?',
      [user.id]
    );
    if (planRows.length > 0) {
      user.plan_type = planRows[0].plan_type;
      user.plan_valid_until = planRows[0].plan_valid_until;
      user.trial_started_at = planRows[0].trial_started_at;
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== TRIAL SYSTEM HELPER ====================
/**
 * Check if a user's trial/plan is still valid.
 * Returns { valid: true } or { valid: false, message: '...' }
 */
async function checkTrialValidity(userId) {
  try {
    const [rows] = await mysqlPool.execute(
      'SELECT plan_type, plan_valid_until, credits_balance FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) return { valid: false, message: 'User not found' };
    const { plan_type, plan_valid_until, credits_balance } = rows[0];

    // Check plan expiry
    if (plan_valid_until) {
      const now = new Date();
      const expiry = new Date(plan_valid_until);
      if (now > expiry) {
        return {
          valid: false,
          message: 'Plan expired or insufficient credits.'
        };
      }
    }

    // Check credits_balance if it is set (i.e., user is on a plan)
    if (credits_balance !== null && credits_balance !== undefined) {
      const creditsNum = parseFloat(credits_balance);
      if (!isNaN(creditsNum) && creditsNum <= 0) {
        // Also check wallet balance as fallback
        try {
          const [walletRows] = await mysqlPool.execute('SELECT balance FROM user_wallets WHERE user_id = ?', [userId]);
          const walletBalance = walletRows.length > 0 ? parseFloat(walletRows[0].balance) : 0;
          if (walletBalance <= 0) {
            return {
              valid: false,
              message: 'Plan expired or insufficient credits.'
            };
          }
        } catch (e) {
          // If wallet check fails, don't block
        }
      }
    }

    return { valid: true };
  } catch (err) {
    console.error('checkTrialValidity error:', err);
    return { valid: true }; // fail-open to not block on DB errors
  }
}

async function enforceTrialValidity(req, res, next) {
  const userId = req.body?.userId || req.query?.userId || req.user?.id || req.body?.agent?.userId;
  if (!userId) return next();
  const validity = await checkTrialValidity(userId);
  if (!validity.valid) {
    return res.status(403).json({ success: false, message: validity.message || 'Trial expired. Please upgrade your plan.' });
  }
  next();
}

// =============================================================

// User registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ success: false, message: 'Email, username, and password are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    // Username validation (alphanumeric, 3-20 characters)
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ success: false, message: 'Username must be 3-20 alphanumeric characters' });
    }

    // Password strength validation (at least 6 characters)
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    const user = await authService.registerUser(email, username, password);

    // Default company creation
    const companyId = uuidv4();
    await mysqlPool.execute('INSERT INTO companies (id, user_id, name) VALUES (?, ?, ?)', [companyId, user.id, 'Default Company']);

    // Trial plan + 50 credits on sign-up
    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + 14);
    const TRIAL_CREDITS = 50;
    await mysqlPool.execute(
      `UPDATE users SET current_company_id = ?, plan_type = 'trial', trial_started_at = ?, plan_valid_until = ? WHERE id = ?`,
      [companyId, trialStart, trialEnd, user.id]
    );
    user.current_company_id = companyId;
    user.plan_type = 'trial';
    user.trial_started_at = trialStart;
    user.plan_valid_until = trialEnd;

    // Create wallet with 50 trial credits
    const walletId = uuidv4();
    await mysqlPool.execute(
      'INSERT INTO user_wallets (id, user_id, balance) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance = balance',
      [walletId, user.id, TRIAL_CREDITS]
    );
    // Record trial credit transaction
    const txId = uuidv4();
    await mysqlPool.execute(
      `INSERT INTO wallet_transactions (id, user_id, transaction_type, amount, balance_after, service_type, description, created_by)
       VALUES (?, ?, 'credit', ?, ?, 'initial_credit', 'Free trial” 50 credits', NULL)`,
      [txId, user.id, TRIAL_CREDITS, TRIAL_CREDITS]
    );

    console.log(` New user ${email} registered with 14-day trial and ${TRIAL_CREDITS} credits`);
    res.json({ success: true, user });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.message === 'User already exists') {
      return res.status(409).json({ success: false, message: 'User with this email or username already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});


// ==================== TRIAL / PLAN ENDPOINTS ====================

// Get trial/plan status for a user (frontend uses this)
app.get('/api/users/plan/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await mysqlPool.execute(
      'SELECT plan_type, plan_valid_until, trial_started_at FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const { plan_type, plan_valid_until, trial_started_at } = rows[0];
    const now = new Date();
    const expiry = plan_valid_until ? new Date(plan_valid_until) : null;
    const isExpired = expiry && now > expiry;
    const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))) : null;
    res.json({
      success: true,
      plan_type: plan_type || null,
      plan_valid_until: plan_valid_until || null,
      trial_started_at: trial_started_at || null,
      is_expired: isExpired,
      days_left: daysLeft
    });
  } catch (error) {
    console.error('Error fetching plan status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin: Get user plan details
app.get('/api/admin/users/:userId/plan', async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await mysqlPool.execute(
      'SELECT id, email, username, plan_type, plan_valid_until, trial_started_at FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const user = rows[0];
    const now = new Date();
    const expiry = user.plan_valid_until ? new Date(user.plan_valid_until) : null;
    const isExpired = expiry && now > expiry;
    const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))) : null;
    res.json({ success: true, user, is_expired: isExpired, days_left: daysLeft });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin: Update user plan (type + validity + optional extend by days)
app.patch('/api/admin/users/:userId/plan', async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan_type, plan_valid_until, extend_days, adminId } = req.body;

    if (!adminId) return res.status(400).json({ success: false, message: 'adminId is required' });

    const ALLOWED_PLAN_TYPES = ['trial', 'paid', 'enterprise'];
    const updates = [];
    const values = [];

    if (plan_type !== undefined) {
      if (!ALLOWED_PLAN_TYPES.includes(plan_type)) {
        return res.status(400).json({ success: false, message: `plan_type must be one of: ${ALLOWED_PLAN_TYPES.join(', ')}` });
      }
      updates.push('plan_type = ?');
      values.push(plan_type);
    }

    if (plan_valid_until !== undefined) {
      updates.push('plan_valid_until = ?');
      values.push(new Date(plan_valid_until));
    } else if (extend_days !== undefined) {
      // Extend from current expiry or from now
      const [currentRows] = await mysqlPool.execute('SELECT plan_valid_until FROM users WHERE id = ?', [userId]);
      const current = currentRows[0]?.plan_valid_until;
      const base = current && new Date(current) > new Date() ? new Date(current) : new Date();
      base.setDate(base.getDate() + parseInt(extend_days));
      updates.push('plan_valid_until = ?');
      values.push(base);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update. Provide plan_type, plan_valid_until, or extend_days.' });
    }

    values.push(userId);
    await mysqlPool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    adminService.logActivity(
      adminId,
      'update_user_plan',
      userId,
      `Updated plan: ${JSON.stringify({ plan_type, plan_valid_until, extend_days })}`,
      req.ip
    );

    // Re-fetch updated values
    const [updated] = await mysqlPool.execute(
      'SELECT plan_type, plan_valid_until, trial_started_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({ success: true, message: 'Plan updated successfully', plan: updated[0] });
  } catch (error) {
    console.error('Error updating user plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== PLAN MANAGEMENT ENDPOINTS ====================

// GET /api/admin/plans - List all plans
app.get('/api/admin/plans', async (req, res) => {
  try {
    const orgId = req.query.orgId && req.query.orgId !== 'null' ? parseInt(req.query.orgId) : null;
    let query = 'SELECT * FROM plans';
    let params = [];
    if (orgId) {
      query += ' WHERE organization_id = ? ORDER BY created_at DESC';
      params.push(orgId);
    } else {
      query += ' WHERE (organization_id IS NULL) ORDER BY created_at DESC';
    }
    const [plans] = await mysqlPool.execute(query, params);
    res.json({ success: true, plans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/plans/:planId - Get a single plan
app.get('/api/admin/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const [plans] = await mysqlPool.execute('SELECT * FROM plans WHERE id = ?', [planId]);
    if (plans.length === 0) return res.status(404).json({ success: false, message: 'Plan not found' });
    res.json({ success: true, plan: plans[0] });
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/plans - Create a new plan
app.post('/api/admin/plans', async (req, res) => {
  try {
    const { plan_name, credit_limit, validity_days, plan_type, adminId, organization_id } = req.body;

    if (!plan_name || !credit_limit || !validity_days) {
      return res.status(400).json({ success: false, message: 'plan_name, credit_limit, and validity_days are required' });
    }
    if (credit_limit <= 0 || validity_days <= 0) {
      return res.status(400).json({ success: false, message: 'credit_limit and validity_days must be positive numbers' });
    }

    // Check organization capacity if it's an org admin creating an internal plan
    if (organization_id) {
       const [orgs] = await mysqlPool.execute('SELECT credit_balance FROM organizations WHERE id = ?', [organization_id]);
       if (orgs.length === 0) return res.status(404).json({ success: false, message: 'Organization not found' });
       if (orgs[0].credit_balance < parseInt(credit_limit)) {
         return res.status(400).json({ success: false, message: 'Insufficient organization credit balance to create this plan.' });
       }
    }

    const planId = uuidv4();
    const finalPlanType = organization_id ? 'organization_plan' : 'platform_plan';
    const finalOrgId = organization_id || null;

    await mysqlPool.execute(
      'INSERT INTO plans (id, plan_name, credit_limit, validity_days, plan_type, organization_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [planId, plan_name.trim(), parseInt(credit_limit), parseInt(validity_days), finalPlanType, finalOrgId, adminId || null]
    );

    if (adminId) {
      adminService.logActivity(adminId, 'create_plan', null, `Created plan: ${plan_name}`, req.ip);
    }

    const [newPlan] = await mysqlPool.execute('SELECT * FROM plans WHERE id = ?', [planId]);
    res.json({ success: true, plan: newPlan[0], message: 'Plan created successfully' });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/admin/plans/:planId - Update a plan
app.put('/api/admin/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const { plan_name, credit_limit, validity_days, plan_type, adminId } = req.body;

    const updates = [];
    const values = [];

    if (plan_name !== undefined) { updates.push('plan_name = ?'); values.push(plan_name.trim()); }
    if (credit_limit !== undefined) { updates.push('credit_limit = ?'); values.push(parseInt(credit_limit)); }
    if (validity_days !== undefined) { updates.push('validity_days = ?'); values.push(parseInt(validity_days)); }
    if (plan_type !== undefined) { updates.push('plan_type = ?'); values.push(plan_type); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    values.push(planId);
    await mysqlPool.execute(`UPDATE plans SET ${updates.join(', ')} WHERE id = ?`, values);

    if (adminId) {
      adminService.logActivity(adminId, 'update_plan', null, `Updated plan ${planId}`, req.ip);
    }

    const [updated] = await mysqlPool.execute('SELECT * FROM plans WHERE id = ?', [planId]);
    if (updated.length === 0) return res.status(404).json({ success: false, message: 'Plan not found' });

    res.json({ success: true, plan: updated[0], message: 'Plan updated successfully' });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/plans/:planId - Delete a plan
app.delete('/api/admin/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const { adminId } = req.query;

    // Check if any users are on this plan
    const [usersOnPlan] = await mysqlPool.execute('SELECT COUNT(*) as count FROM users WHERE plan_id = ?', [planId]);
    if (usersOnPlan[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan: ${usersOnPlan[0].count} user(s) are currently assigned to this plan. Reassign them first.`
      });
    }

    await mysqlPool.execute('DELETE FROM plans WHERE id = ?', [planId]);

    if (adminId) {
      adminService.logActivity(adminId, 'delete_plan', null, `Deleted plan ${planId}`, req.ip);
    }

    res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/users/:userId/assign-plan - Assign a plan to a user
app.post('/api/admin/users/:userId/assign-plan', async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId, adminId } = req.body;

    if (!planId || !adminId) {
      return res.status(400).json({ success: false, message: 'planId and adminId are required' });
    }

    // Fetch plan details
    const [plans] = await mysqlPool.execute('SELECT * FROM plans WHERE id = ?', [planId]);
    if (plans.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const plan = plans[0];
    const now = new Date();
    const planValidUntil = new Date(now);
    planValidUntil.setDate(planValidUntil.getDate() + parseInt(plan.validity_days));

    // Organization credit pool deduction for organization plans
    if (plan.organization_id) {
       const [orgs] = await mysqlPool.execute('SELECT credit_balance FROM organizations WHERE id = ?', [plan.organization_id]);
       if (orgs.length === 0) return res.status(404).json({ success: false, message: 'Organization not found' });
       if (orgs[0].credit_balance < parseInt(plan.credit_limit)) {
         return res.status(400).json({ success: false, message: 'Organization has insufficient credits. Contact Super Admin to upgrade organization plan.' });
       }
       // Deduct from organization pool
       await mysqlPool.execute('UPDATE organizations SET credit_balance = credit_balance - ? WHERE id = ?', [parseInt(plan.credit_limit), plan.organization_id]);
    }

    // Update user with plan details
    await mysqlPool.execute(
      `UPDATE users SET
        plan_id = ?,
        credits_balance = ?,
        plan_started_at = ?,
        plan_valid_until = ?,
        plan_type = ?
       WHERE id = ?`,
      [planId, parseInt(plan.credit_limit), now, planValidUntil, plan.plan_type || 'paid', userId]
    );

    // Also update the wallet balance to match plan credits
    try {
      await mysqlPool.execute(
        'UPDATE user_wallets SET balance = ? WHERE user_id = ?',
        [parseInt(plan.credit_limit), userId]
      );
      // If no wallet row exists, create one
      const [walletRows] = await mysqlPool.execute('SELECT id FROM user_wallets WHERE user_id = ?', [userId]);
      if (walletRows.length === 0) {
        const walletId = uuidv4();
        await mysqlPool.execute(
          'INSERT INTO user_wallets (id, user_id, balance) VALUES (?, ?, ?)',
          [walletId, userId, parseInt(plan.credit_limit)]
        );
      }
    } catch (walletErr) {
      console.warn('Could not update wallet (may not exist yet):', walletErr.message);
    }

    // Log wallet transaction for the plan assignment
    try {
      const txId = uuidv4();
      const [userRow] = await mysqlPool.execute('SELECT id FROM users WHERE id = ?', [userId]);
      if (userRow.length > 0) {
        await mysqlPool.execute(
          `INSERT INTO wallet_transactions (id, user_id, transaction_type, amount, balance_after, service_type, description, created_by)
           VALUES (?, ?, 'credit', ?, ?, 'plan_assignment', ?, ?)`,
          [txId, userId, parseInt(plan.credit_limit), parseInt(plan.credit_limit), `Plan assigned: ${plan.plan_name}`, adminId]
        );
      }
    } catch (txErr) {
      console.warn('Could not log wallet transaction:', txErr.message);
    }

    adminService.logActivity(
      adminId,
      'assign_plan',
      userId,
      `Assigned plan "${plan.plan_name}" (${plan.credit_limit} credits, ${plan.validity_days} days)`,
      req.ip
    );

    // Fetch updated user info
    const [updatedUser] = await mysqlPool.execute(
      'SELECT id, email, username, plan_id, credits_balance, plan_started_at, plan_valid_until, plan_type FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      success: true,
      message: `Plan "${plan.plan_name}" assigned successfully`,
      user: updatedUser[0],
      plan: {
        ...plan,
        plan_started_at: now,
        plan_valid_until: planValidUntil
      }
    });
  } catch (error) {
    console.error('Error assigning plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/users/plan-access/:userId - Check if user can perform restricted actions
app.get('/api/users/plan-access/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await mysqlPool.execute(
      'SELECT credits_balance, plan_valid_until, plan_type, plan_id FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const user = rows[0];
    const now = new Date();
    const expiry = user.plan_valid_until ? new Date(user.plan_valid_until) : null;

    // Also check wallet balance
    let walletBalance = 0;
    try {
      const [walletRows] = await mysqlPool.execute('SELECT balance FROM user_wallets WHERE user_id = ?', [userId]);
      if (walletRows.length > 0) walletBalance = parseFloat(walletRows[0].balance) || 0;
    } catch (e) { /* ignore */ }

    const effectiveCredits = user.credits_balance !== null ? parseFloat(user.credits_balance) : walletBalance;
    const isExpired = expiry ? now > expiry : false;
    const hasCredits = effectiveCredits > 0;

    const canAccess = hasCredits && !isExpired;

    res.json({
      success: true,
      can_access: canAccess,
      credits_balance: effectiveCredits,
      plan_valid_until: user.plan_valid_until || null,
      is_expired: isExpired,
      has_credits: hasCredits,
      plan_type: user.plan_type || null,
      blocking_reason: !canAccess
        ? (!hasCredits ? 'insufficient_credits' : 'plan_expired')
        : null
    });
  } catch (error) {
    console.error('Error checking plan access:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== END PLAN MANAGEMENT ENDPOINTS ====================

// ================================================================

// Get user profile

app.get('/api/users/profile/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const [rows] = await mysqlPool.execute(
      'SELECT id, email, username, full_name, profile_image, DATE_FORMAT(dob, "%Y-%m-%d") as dob, gender, current_company_id, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update user profile
app.put('/api/users/profile/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { email, username, full_name, profile_image, dob, gender, current_company_id } = req.body;

    // Build query dynamically to only update provided fields
    const updates = [];
    const values = [];

    if (email !== undefined) { updates.push('email = ?'); values.push(email); }
    if (username !== undefined) { updates.push('username = ?'); values.push(username); }
    if (full_name !== undefined) { updates.push('full_name = ?'); values.push(full_name); }
    if (profile_image !== undefined) { updates.push('profile_image = ?'); values.push(profile_image); }
    if (dob !== undefined) { updates.push('dob = ?'); values.push(dob); }
    if (gender !== undefined) { updates.push('gender = ?'); values.push(gender); }
    if (current_company_id !== undefined) { updates.push('current_company_id = ?'); values.push(current_company_id); }

    if (updates.length > 0) {
      values.push(userId);
      await mysqlPool.execute(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    const [rows] = await mysqlPool.execute(
      'SELECT id, email, username, full_name, profile_image, DATE_FORMAT(dob, "%Y-%m-%d") as dob, gender, current_company_id, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ADMIN PANEL ENDPOINTS ====================

// TEPMORARY ENDPOINT TO CREATE ADMIN
app.get('/api/create-admin-user', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    console.log('Creating admin user...');

    // 1. Create table
    await mysqlPool.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role ENUM('super_admin', 'admin', 'billing') DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // 2. Hash password
    const email = 'admin@ziyavoice.com';
    const password = 'admin123';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const adminId = uuidv4();

    // 3. Insert or Update
    // Check if exists
    const [rows] = await mysqlPool.execute('SELECT * FROM admin_users WHERE email = ?', [email]);

    if (rows.length > 0) {
      await mysqlPool.execute(
        'UPDATE admin_users SET password_hash = ? WHERE email = ?',
        [hashedPassword, email]
      );
      res.json({ success: true, message: 'Admin exists. Password reset to: admin123' });
    } else {
      await mysqlPool.execute(
        'INSERT INTO admin_users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
        [adminId, email, hashedPassword, 'System Admin', 'super_admin']
      );
      res.json({ success: true, message: 'Admin created. Email: admin@ziyavoice.com, Password: admin123' });
    }
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Super Admin stats
app.get('/api/superadmin/stats', async (req, res) => {
  try {
    const stats = await organizationService.getSuperAdminStats();
    res.json({ success: true, stats });
  } catch (err) {
    console.error('Super admin stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// List organizations
app.get('/api/superadmin/organizations', async (req, res) => {
  try {
    const organizations = await organizationService.listOrganizations();
    res.json({ success: true, organizations });
  } catch (err) {
    console.error('List organizations error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create organization
app.post('/api/superadmin/organizations', async (req, res) => {
  try {
    const { name, createdBy, logo_url } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Organization name is required' });
    }
    const organization = await organizationService.createOrganization(name.trim(), createdBy, logo_url);
    res.json({ success: true, organization });
  } catch (err) {
    console.error('Create organization error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update organization
app.put('/api/superadmin/organizations/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    const { name, status, logo_url } = req.body;
    const organization = await organizationService.updateOrganization(parseInt(orgId), { name, status, logo_url });
    res.json({ success: true, organization });
  } catch (err) {
    console.error('Update organization error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Impersonate User
app.post('/api/superadmin/impersonate', async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const [rows] = await mysqlPool.execute(
      'SELECT id, email, username, full_name, profile_image, DATE_FORMAT(dob, "%Y-%m-%d") as dob, gender, current_company_id, role, organization_id, status, plan_type, plan_valid_until, trial_started_at FROM users WHERE id = ?', 
      [targetUserId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const user = rows[0];
    res.json({ success: true, user });
  } catch (err) {
    console.error('Impersonate user error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Assign plain to organization
app.post('/api/superadmin/organizations/:orgId/assign-plan', async (req, res) => {
  try {
    const { orgId } = req.params;
    const { planId, adminId } = req.body;
    
    // Get plan details
    const [plans] = await mysqlPool.execute('SELECT * FROM plans WHERE id = ?', [planId]);
    if (plans.length === 0) return res.status(404).json({ success: false, message: 'Plan not found' });
    const plan = plans[0];

    const now = new Date();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + parseInt(plan.validity_days));

    // Insert into organization_plans
    await mysqlPool.execute(
      `INSERT INTO organization_plans (organization_id, plan_id, credits_allocated, plan_started_at, plan_valid_until)
       VALUES (?, ?, ?, ?, ?)`,
      [parseInt(orgId), planId, parseInt(plan.credit_limit), now, validUntil]
    );

    // Update organization credit balance
    await mysqlPool.execute(
      'UPDATE organizations SET credit_balance = ? WHERE id = ?', 
      [parseInt(plan.credit_limit), parseInt(orgId)]
    );

    if (adminId) {
      adminService.logActivity(adminId, 'assign_org_plan', null, `Assigned plan ${plan.plan_name} to Organization ${orgId}`, req.ip);
    }

    res.json({ success: true, message: 'Plan assigned to organization successfully.' });
  } catch (err) {
    console.error('Assign org plan error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Disable organization
app.patch('/api/superadmin/organizations/:orgId/disable', async (req, res) => {
  try {
    const { orgId } = req.params;
    await organizationService.disableOrganization(parseInt(orgId));
    res.json({ success: true, message: 'Organization disabled' });
  } catch (err) {
    console.error('Disable organization error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete organization and its dependent users/admins
app.delete('/api/superadmin/organizations/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    const [rows] = await mysqlPool.execute('SELECT id FROM organizations WHERE id = ?', [orgId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Organization not found' });
    
    // First find all users in this org
    const [users] = await mysqlPool.execute('SELECT id FROM users WHERE organization_id = ?', [orgId]);
    const userIds = users.map(u => u.id);
    
    // Try cascade cleanup for all users in the org
    for (const uId of userIds) {
      await mysqlPool.execute('DELETE FROM user_wallets WHERE user_id = ?', [uId]).catch(() => {});
      await mysqlPool.execute('DELETE FROM wallet_transactions WHERE user_id = ?', [uId]).catch(() => {});
    }
    
    // Delete users associated with the org
    await mysqlPool.execute('DELETE FROM users WHERE organization_id = ?', [orgId]).catch(() => {});
    
    // Finally, delete the organization
    await mysqlPool.execute('DELETE FROM organizations WHERE id = ?', [orgId]);
    res.json({ success: true, message: 'Organization permanently deleted' });
  } catch (err) {
    console.error('Delete organization error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// List org admins
app.get('/api/superadmin/org-admins', async (req, res) => {
  try {
    const orgAdmins = await organizationService.listOrgAdmins();
    res.json({ success: true, orgAdmins });
  } catch (err) {
    console.error('List org admins error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create org admin
app.post('/api/superadmin/org-admins', async (req, res) => {
  try {
    const { email, username, password, organization_id } = req.body;
    if (!email || !username || !password || !organization_id) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const orgAdmin = await organizationService.createOrgAdmin({ email, username, password, organization_id });
    res.json({ success: true, orgAdmin });
  } catch (err) {
    console.error('Create org admin error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete org admin
app.delete('/api/superadmin/org-admins/:adminId', async (req, res) => {
  try {
    const { adminId } = req.params;
    const [rows] = await mysqlPool.execute("SELECT id, role FROM users WHERE id = ? AND role = 'org_admin'", [adminId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Org Admin not found' });

    await mysqlPool.execute('DELETE FROM user_wallets WHERE user_id = ?', [adminId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM wallet_transactions WHERE user_id = ?', [adminId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM users WHERE id = ?', [adminId]);
    res.json({ success: true, message: 'Org Admin permanently deleted' });
  } catch (err) {
    console.error('Delete org admin error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// List all users (super admin)
app.get('/api/superadmin/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const orgId = req.query.orgId ? parseInt(req.query.orgId) : null;
    const result = await organizationService.listAllUsers({ page, limit, search, orgId });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Super admin list users error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Block / unblock user (super admin)
app.patch('/api/superadmin/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    if (!['active', 'locked', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    await mysqlPool.execute('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
    res.json({ success: true, message: `User status set to ${status}` });
  } catch (err) {
    console.error('Super admin block user error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete user (super admin)
app.delete('/api/superadmin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await mysqlPool.execute("SELECT id, role FROM users WHERE id = ? AND role = 'user'", [userId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    await mysqlPool.execute('DELETE FROM user_wallets WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM wallet_transactions WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ success: true, message: 'User permanently deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  Super Admin: Price Management Dashboard 

// GET all service pricing rows
app.get('/api/superadmin/pricing/services', async (req, res) => {
  try {
    const [rows] = await mysqlPool.execute('SELECT * FROM service_pricing ORDER BY service_type ASC');
    res.json({ success: true, pricing: rows });
  } catch (err) {
    console.error('Get service pricing error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update a single service's cost_per_unit
app.put('/api/superadmin/pricing/services/:serviceType', async (req, res) => {
  try {
    const { serviceType } = req.params;
    const { costPerUnit } = req.body;
    if (costPerUnit === undefined || isNaN(parseFloat(costPerUnit))) {
      return res.status(400).json({ success: false, message: 'costPerUnit is required and must be a number' });
    }
    const [result] = await mysqlPool.execute(
      'UPDATE service_pricing SET cost_per_unit = ?, updated_at = NOW() WHERE service_type = ?',
      [parseFloat(costPerUnit), serviceType]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Service type not found' });
    }
    // Invalidate the in-memory cache in costCalculator
    if (costCalculator) { costCalculator.lastCacheUpdate = 0; }
    res.json({ success: true, message: `Pricing for ${serviceType} updated successfully.` });
  } catch (err) {
    console.error('Update service pricing error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// In-memory state for dynamic config overrides (persists until server restart)
let dynamicPlatformConfig = null;

// GET platform config rates (reads live from creditConfig.js)
app.get('/api/superadmin/pricing/config', async (req, res) => {
  try {
    const creditConfig = require('./config/creditConfig');
    const current = dynamicPlatformConfig || {
      usdToInrRate: creditConfig.USD_TO_INR_RATE,
      inrToCreditRate: creditConfig.INR_TO_CREDIT_RATE,
      hiddenProfitPercentage: creditConfig.HIDDEN_PROFIT_PERCENTAGE,
    };
    res.json({ success: true, config: current });
  } catch (err) {
    console.error('Get platform config error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update platform config rates at runtime (without file edit)
app.put('/api/superadmin/pricing/config', async (req, res) => {
  try {
    const { usdToInrRate, inrToCreditRate, hiddenProfitPercentage } = req.body;
    if (usdToInrRate !== undefined) dynamicPlatformConfig = { ...(dynamicPlatformConfig || {}), usdToInrRate: parseFloat(usdToInrRate) };
    if (inrToCreditRate !== undefined) dynamicPlatformConfig = { ...(dynamicPlatformConfig || {}), inrToCreditRate: parseFloat(inrToCreditRate) };
    if (hiddenProfitPercentage !== undefined) dynamicPlatformConfig = { ...(dynamicPlatformConfig || {}), hiddenProfitPercentage: parseFloat(hiddenProfitPercentage) };
    
    // Apply overrides to the live creditConfig module
    const creditConfig = require('./config/creditConfig');
    if (dynamicPlatformConfig.usdToInrRate !== undefined) creditConfig.USD_TO_INR_RATE = dynamicPlatformConfig.usdToInrRate;
    if (dynamicPlatformConfig.inrToCreditRate !== undefined) creditConfig.INR_TO_CREDIT_RATE = dynamicPlatformConfig.inrToCreditRate;
    if (dynamicPlatformConfig.hiddenProfitPercentage !== undefined) creditConfig.HIDDEN_PROFIT_PERCENTAGE = dynamicPlatformConfig.hiddenProfitPercentage;
    
    // Invalidate cost cache
    if (costCalculator) { costCalculator.lastCacheUpdate = 0; }
    res.json({ success: true, message: 'Platform config updated. Changes are active immediately.', config: dynamicPlatformConfig });
  } catch (err) {
    console.error('Update platform config error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  Individual Users (role = individual_user) 


// GET /api/superadmin/individual-users - List all individual_user accounts
app.get('/api/superadmin/individual-users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    const searchParam = `%${search}%`;
    const [users] = await mysqlPool.execute(
      `SELECT u.id, u.email, u.username, u.role, u.status, u.credits_balance, u.plan_type, u.plan_valid_until, u.created_at
       FROM users u
       WHERE u.role = 'individual_user'
         AND (u.email LIKE ? OR u.username LIKE ?)
       ORDER BY u.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [searchParam, searchParam]
    );
    const [[{ total }]] = await mysqlPool.execute(
      `SELECT COUNT(*) as total FROM users WHERE role = 'individual_user' AND (email LIKE ? OR username LIKE ?)`,
      [searchParam, searchParam]
    );
    res.json({ success: true, users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Individual users list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/superadmin/individual-users/:userId - Permanently delete an individual user
app.delete('/api/superadmin/individual-users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await mysqlPool.execute('SELECT id, role FROM users WHERE id = ? AND role = ?', [userId, 'individual_user']);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Individual user not found' });

    // Cascade cleanup (best-effort)
    await mysqlPool.execute('DELETE FROM user_wallets WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM wallet_transactions WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true, message: 'User deleted permanently.' });
  } catch (err) {
    console.error('Delete individual user error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/superadmin/individual-users/:userId/status - Block/Unblock
app.patch('/api/superadmin/individual-users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    if (!['active', 'locked'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    await mysqlPool.execute('UPDATE users SET status = ? WHERE id = ? AND role = ?', [status, userId, 'individual_user']);
    res.json({ success: true, message: `User ${status}` });
  } catch (err) {
    console.error('Update individual user status error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Assign plan to user (super admin” delegates to admin logic)
app.post('/api/superadmin/users/:userId/assign-plan', async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ success: false, message: 'planId is required' });
    // Look up plan
    const [plans] = await mysqlPool.execute('SELECT * FROM plans WHERE id = ?', [planId]);
    if (plans.length === 0) return res.status(404).json({ success: false, message: 'Plan not found' });
    const plan = plans[0];
    // Compute expiry
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + (plan.validity_days || 30));
    await mysqlPool.execute(
      'UPDATE users SET plan_id = ?, plan_valid_until = ?, credits_balance = ? WHERE id = ?',
      [planId, validUntil.toISOString().split('T')[0], plan.credit_limit, userId]
    );
    res.json({ success: true, message: 'Plan assigned successfully' });
  } catch (err) {
    console.error('Super admin assign plan error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create user under an org (used by org admins from their admin panel)
app.post('/api/admin/users', async (req, res) => {
  try {
    const { email, username, password, organization_id } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ success: false, message: 'Email, username and password are required' });
    }
    // Check email uniqueness
    const [existing] = await mysqlPool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    const bcryptLib = require('bcryptjs');
    const passwordHash = await bcryptLib.hash(password, 10);
    const userId = require('crypto').randomBytes(8).toString('hex');
    await mysqlPool.execute(
      `INSERT INTO users (id, email, username, password_hash, role, organization_id, status)
       VALUES (?, ?, ?, ?, 'user', ?, 'active')`,
      [userId, email, username, passwordHash, organization_id || 5]
    );
    // Create default company for the new user
    const companyId = uuidv4();
    await mysqlPool.execute(
      'INSERT INTO companies (id, user_id, name) VALUES (?, ?, ?)',
      [companyId, userId, `${username}'s Company`]
    );
    await mysqlPool.execute('UPDATE users SET current_company_id = ? WHERE id = ?', [companyId, userId]);
    res.json({ success: true, message: 'User created successfully', userId });
  } catch (err) {
    console.error('Create admin user error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// PROFILE & SETTINGS ENDPOINTS
// ============================================================

// POST /api/admin/profile/update” Update org admin profile (name, username)
app.post('/api/admin/profile/update', async (req, res) => {
  try {
    const { userId, name, username } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const updates = [];
    const values = [];
    if (name !== undefined)     { updates.push('name = ?');     values.push(name); }
    if (username !== undefined) { updates.push('username = ?'); values.push(username); }
    if (updates.length === 0)   return res.status(400).json({ success: false, message: 'Nothing to update' });

    values.push(userId);
    await mysqlPool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    // Return updated user row
    const [rows] = await mysqlPool.execute(
      'SELECT id, email, username, name, role, organization_id FROM users WHERE id = ?',
      [userId]
    );
    res.json({ success: true, message: 'Profile updated successfully', user: rows[0] });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/branding/update” Update org branding (logo URL, custom domain)
app.post('/api/admin/branding/update', async (req, res) => {
  try {
    const { adminId, logoUrl, customDomain } = req.body;
    if (!adminId) return res.status(400).json({ success: false, message: 'adminId required' });

    // Get org id for this admin
    const [adminRows] = await mysqlPool.execute('SELECT organization_id FROM users WHERE id = ?', [adminId]);
    if (adminRows.length === 0) return res.status(404).json({ success: false, message: 'Admin not found' });
    const orgId = adminRows[0].organization_id;
    if (!orgId) return res.status(400).json({ success: false, message: 'Admin has no organization' });

    const updates = [];
    const values = [];
    if (logoUrl !== undefined)      { updates.push('logo_url = ?');      values.push(logoUrl); }
    if (customDomain !== undefined) { updates.push('custom_domain = ?'); values.push(customDomain); }

    if (updates.length > 0) {
      values.push(orgId);
      // Add columns if they don't exist (graceful)
      try {
        await mysqlPool.execute('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url VARCHAR(512) DEFAULT NULL');
        await mysqlPool.execute('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) DEFAULT NULL');
      } catch (_) {}
      await mysqlPool.execute(`UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({ success: true, message: 'Branding settings updated!' });
  } catch (err) {
    console.error('Branding update error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Auto-create platform_settings table
(async () => {
  try {
    await mysqlPool.execute(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    // Seed defaults if empty
    const [rows] = await mysqlPool.execute('SELECT COUNT(*) as cnt FROM platform_settings');
    if (rows[0].cnt === 0) {
      await mysqlPool.execute(
        `INSERT INTO platform_settings (setting_key, setting_value) VALUES
          ('platform_name', 'Ziya Voice'),
          ('support_email', 'support@ziyavoice.com'),
          ('maintenance_mode', '0'),
          ('max_concurrent_calls', '2000'),
          ('storage_quota_gb', '50'),
          ('platform_margin', '25'),
          ('notify_daily_report', '1'),
          ('notify_critical', '1'),
          ('notify_new_org', '1'),
          ('notify_wallet_empty', '0')`
      );
    }
    console.log('Platform settings table ready');
  } catch (err) {
    console.warn(' Could not create platform_settings table:', err.message);
  }
})();

// GET /api/superadmin/settings” Get all platform settings
app.get('/api/superadmin/settings', async (req, res) => {
  try {
    const [rows] = await mysqlPool.execute('SELECT setting_key, setting_value FROM platform_settings');
    const settings = {};
    rows.forEach((r) => { settings[r.setting_key] = r.setting_value; });
    res.json({ success: true, settings });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/superadmin/settings” Bulk upsert platform settings
app.post('/api/superadmin/settings', async (req, res) => {
  try {
    const { settings } = req.body; // { key: value, ... }
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'settings object required' });
    }
    for (const [key, value] of Object.entries(settings)) {
      await mysqlPool.execute(
        `INSERT INTO platform_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, String(value)]
      );
    }
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// SUPPORT TICKET SYSTEM
// ============================================================


// Auto-create support_tickets table if it doesn't exist
(async () => {
  try {
    await mysqlPool.execute(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id VARCHAR(36) PRIMARY KEY,
        subject VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'Technical',
        priority ENUM('Low','Medium','High','Urgent') DEFAULT 'Medium',
        status ENUM('Open','In Progress','Resolved','Closed') DEFAULT 'Open',
        message TEXT NOT NULL,
        created_by VARCHAR(36) NOT NULL,
        created_by_role ENUM('user','org_admin','super_admin') NOT NULL,
        organization_id INT NULL,
        assigned_to VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_created_by (created_by),
        INDEX idx_organization_id (organization_id),
        INDEX idx_status (status),
        INDEX idx_created_by_role (created_by_role)
      )
    `);
    await mysqlPool.execute(`
      CREATE TABLE IF NOT EXISTS support_ticket_replies (
        id VARCHAR(36) PRIMARY KEY,
        ticket_id VARCHAR(36) NOT NULL,
        reply_by VARCHAR(36) NOT NULL,
        reply_by_role ENUM('user','org_admin','super_admin') NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
      )
    `);
    console.log(' Support ticket tables ready');
  } catch (err) {
    console.warn(' Could not create support_tickets table:', err.message);
  }
})();

// POST /api/support/tickets – Create a new ticket
app.post('/api/support/tickets', async (req, res) => {
  try {
    const { subject, category, priority, message, created_by, created_by_role, target_role, organization_id } = req.body;
    if (!subject || !message || !created_by || !created_by_role || !target_role) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const ticketId = require('crypto').randomBytes(8).toString('hex');
    await mysqlPool.execute(
      `INSERT INTO support_tickets (id, subject, category, priority, message, created_by, created_by_role, target_role, organization_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, subject, category || 'Technical', priority || 'Medium', message, created_by, created_by_role, target_role, organization_id || null]
    );
    const [rows] = await mysqlPool.execute('SELECT * FROM support_tickets WHERE id = ?', [ticketId]);
    res.json({ success: true, ticket: rows[0] });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/support/tickets” List tickets (scoped by role & query params)
app.get('/api/support/tickets', async (req, res) => {
  try {
    const { created_by, created_by_role, organization_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = [];
    let params = [];

    if (created_by_role === 'user' && created_by) {
      // Regular users see only their own tickets
      where.push('t.created_by = ?');
      params.push(created_by);
    } else if (created_by_role === 'org_admin' && organization_id) {
      // Org admins see tickets from their org users + their own tickets to super admin
      where.push('(t.organization_id = ? OR (t.created_by = ? AND t.created_by_role = "org_admin"))');
      params.push(parseInt(organization_id), created_by);
    }
    // super_admin sees all” no WHERE filter

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const [tickets] = await mysqlPool.execute(
      `SELECT t.*,
              COALESCE(u.username, oa.username, 'Unknown') as created_by_name,
              COALESCE(u.email, oa.email, 'Unknown') as created_by_email
       FROM support_tickets t
       LEFT JOIN users u ON t.created_by = u.id AND t.created_by_role = 'user'
       LEFT JOIN users oa ON t.created_by = oa.id AND t.created_by_role = 'org_admin'
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      params
    );

    const [[{ total }]] = await mysqlPool.execute(
      `SELECT COUNT(*) as total FROM support_tickets t ${whereClause}`, params
    );

    // Attach last reply to each ticket
    const enriched = await Promise.all(tickets.map(async (ticket) => {
      const [replies] = await mysqlPool.execute(
        'SELECT message, reply_by_role, created_at FROM support_ticket_replies WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1',
        [ticket.id]
      );
      return {
        ...ticket,
        lastMessage: replies.length > 0 ? (`${replies[0].reply_by_role}: ${replies[0].message}`) : ticket.message,
      };
    }));

    res.json({ success: true, tickets: enriched, pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error('List tickets error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/support/tickets/:id” Get full ticket with replies
app.get('/api/support/tickets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [tickets] = await mysqlPool.execute(`
      SELECT t.*,
             COALESCE(u.username, oa.username, 'Unknown') as created_by_name,
             COALESCE(u.email, oa.email, 'Unknown') as created_by_email
      FROM support_tickets t
      LEFT JOIN users u ON t.created_by = u.id AND t.created_by_role = 'user'
      LEFT JOIN users oa ON t.created_by = oa.id AND t.created_by_role = 'org_admin'
      WHERE t.id = ?`, [id]);
    if (tickets.length === 0) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const [replies] = await mysqlPool.execute(
      `SELECT r.*, COALESCE(u.username, au.name, 'Support') as reply_by_name
       FROM support_ticket_replies r
       LEFT JOIN users u ON r.reply_by = u.id
       LEFT JOIN admin_users au ON r.reply_by = au.id
       WHERE r.ticket_id = ?
       ORDER BY r.created_at ASC`,
      [id]
    );

    res.json({ success: true, ticket: tickets[0], replies });
  } catch (err) {
    console.error('Get ticket error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/support/tickets/:id/reply” Add reply to ticket
app.post('/api/support/tickets/:id/reply', async (req, res) => {
  try {
    const { id } = req.params;
    const { message, reply_by, reply_by_role } = req.body;
    if (!message || !reply_by || !reply_by_role) {
      return res.status(400).json({ success: false, message: 'Missing reply fields' });
    }
    const replyId = require('crypto').randomBytes(8).toString('hex');
    await mysqlPool.execute(
      'INSERT INTO support_ticket_replies (id, ticket_id, reply_by, reply_by_role, message) VALUES (?, ?, ?, ?, ?)',
      [replyId, id, reply_by, reply_by_role, message]
    );
    // Update ticket status to In Progress if it was Open
    await mysqlPool.execute(
      `UPDATE support_tickets SET status = CASE WHEN status = 'Open' THEN 'In Progress' ELSE status END, updated_at = NOW() WHERE id = ?`,
      [id]
    );
    res.json({ success: true, message: 'Reply added' });
  } catch (err) {
    console.error('Reply to ticket error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/support/tickets/:id” Update ticket status
app.patch('/api/support/tickets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['Open', 'In Progress', 'Resolved', 'Closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    await mysqlPool.execute('UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    res.json({ success: true, message: `Ticket status updated to ${status}` });
  } catch (err) {
    console.error('Update ticket error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/support/stats” Ticket stats for dashboard widgets
app.get('/api/support/stats', async (req, res) => {
  try {
    const { organization_id } = req.query;
    let where = organization_id ? 'WHERE organization_id = ?' : '';
    let params = organization_id ? [parseInt(organization_id)] : [];
    const [rows] = await mysqlPool.execute(
      `SELECT
         COUNT(*) as total,
         SUM(status = 'Open') as open_count,
         SUM(status = 'In Progress') as in_progress_count,
         SUM(status = 'Resolved') as resolved_count
       FROM support_tickets ${where}`, params
    );
    res.json({ success: true, stats: rows[0] });
  } catch (err) {
    console.error('Support stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// SUPERADMIN: ORG CREDIT ALLOCATION
// ============================================================

// POST /api/superadmin/credits/allocate” Allocate credits to an org admin wallet
app.post('/api/superadmin/credits/allocate', async (req, res) => {
  try {
    const { target_admin_id, amount, description, allocated_by } = req.body;
    if (!target_admin_id || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'target_admin_id and amount > 0 are required' });
    }
    // Add credits to the org admin's wallet
    const result = await walletService.addCredits(
      target_admin_id,
      parseFloat(amount),
      description || `Super Admin allocated ${amount} credits`,
      allocated_by || 'super_admin'
    );
    // Log the action
    try {
      adminService.logActivity(
        allocated_by || 'super_admin',
        'superadmin_credit_allocation',
        target_admin_id,
        `Allocated ${amount} credits to org admin. Reason: ${description || 'N/A'}`,
        null
      );
    } catch (_) {}

    res.json({ success: true, newBalance: result.newBalance, creditsAdded: result.creditsAdded || parseFloat(amount) });
  } catch (err) {
    console.error('Super admin credit allocation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/superadmin/credits/logs” Get credit allocation logs for super admin view
app.get('/api/superadmin/credits/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const [logs] = await mysqlPool.execute(
      `SELECT wt.*, u.username as recipient_name, u.email as recipient_email,
              o.name as org_name
       FROM wallet_transactions wt
       JOIN users u ON wt.user_id = u.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE wt.transaction_type = 'credit'
         AND (wt.service_type = 'plan_assignment' OR wt.created_by LIKE '%admin%' OR wt.description LIKE '%Admin%' OR wt.description LIKE '%Super Admin%')
       ORDER BY wt.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      []
    );
    res.json({ success: true, logs });
  } catch (err) {
    console.error('Super admin credit logs error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/superadmin/credits/org-balances” Get wallet balance for all org admins
app.get('/api/superadmin/credits/org-balances', async (req, res) => {
  try {
    const [rows] = await mysqlPool.execute(
      `SELECT u.id, u.username, u.email, o.id as org_id, o.name as org_name,
              COALESCE(uw.balance, 0) as credits_balance
       FROM users u
       LEFT JOIN organizations o ON u.organization_id = o.id
       LEFT JOIN user_wallets uw ON uw.user_id = u.id
       WHERE u.role = 'org_admin'
       ORDER BY credits_balance DESC`,
      []
    );
    res.json({ success: true, admins: rows });
  } catch (err) {
    console.error('Org balances error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// END SUPER ADMIN ROUTES
// ============================================================


// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const admin = await adminService.login(email, password);
    adminService.logActivity(admin.id, 'admin_login', null, 'Admin logged in', req.ip);

    res.json({ success: true, admin });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Get audit logs
app.get('/api/admin/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const orgId = req.query.orgId && req.query.orgId !== 'null' ? parseInt(req.query.orgId) : null;
    const logsData = await adminService.getAuditLogs(page, limit, orgId);
    res.json({ success: true, ...logsData });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get dashboard statistics
app.get('/api/admin/stats', async (req, res) => {
  try {
    const orgId = req.query.orgId && req.query.orgId !== 'null' ? parseInt(req.query.orgId) : null;
    const stats = await adminService.getDashboardStats(orgId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all users with pagination and search
app.get('/api/admin/users', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const search = req.query.search || '';
    // Handle orgId which may come as array if duplicated in URL params
    const rawOrgId = Array.isArray(req.query.orgId) ? req.query.orgId[0] : req.query.orgId;
    const orgId = rawOrgId && rawOrgId !== 'null' ? parseInt(rawOrgId) : null;

    const result = await adminService.getAllUsers(page, limit, search, orgId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get detailed user information
app.get('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userDetails = await adminService.getUserDetails(userId);
    res.json({ success: true, ...userDetails });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user resources (Agents, Campaigns)
app.get('/api/admin/users/:userId/resources', async (req, res) => {
  try {
    const { userId } = req.params;
    const resources = await adminService.getUserResources(userId);
    res.json({ success: true, ...resources });
  } catch (error) {
    console.error('Error fetching user resources:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Impersonate User
app.get('/api/admin/users/:userId/impersonate', async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminId } = req.query;

    if (!adminId) {
      return res.status(400).json({ success: false, message: 'Admin ID required' });
    }

    const userData = await adminService.getImpersonateUser(userId, adminId);
    res.json({ success: true, user: userData });
  } catch (error) {
    console.error('Error in impersonation endpoint:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update user status
app.patch('/api/admin/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, adminId } = req.body;

    if (!status || !['active', 'inactive', 'locked'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    if (!adminId) {
      return res.status(400).json({ success: false, message: 'Admin ID is required' });
    }

    const result = await adminService.updateUserStatus(userId, status, adminId);
    res.json(result);
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin-led Password Reset
app.post('/api/admin/users/:userId/reset-password', async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword, adminId } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    if (!adminId) {
      return res.status(400).json({ success: false, message: 'Admin ID is required' });
    }

    const result = await adminService.resetUserPassword(userId, newPassword, adminId);
    res.json(result);
  } catch (error) {
    console.error('Error resetting user password:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Set service limit for a user
app.post('/api/admin/users/:userId/limits', async (req, res) => {
  try {
    const { userId } = req.params;
    const { serviceName, monthlyLimit, dailyLimit, isEnabled, adminId } = req.body;

    if (!serviceName || !['elevenlabs', 'gemini', 'deepgram'].includes(serviceName)) {
      return res.status(400).json({ success: false, message: 'Invalid service name' });
    }

    const result = await adminService.setServiceLimit(
      userId,
      serviceName,
      monthlyLimit,
      dailyLimit,
      isEnabled
    );

    adminService.logActivity(
      adminId,
      'set_service_limit',
      userId,
      `Set ${serviceName} limit: monthly=${monthlyLimit}, daily=${dailyLimit}`,
      req.ip
    );

    res.json(result);
  } catch (error) {
    console.error('Error setting service limit:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== WALLET MANAGEMENT ENDPOINTS ====================

// Add credits to user wallet (Admin only)
app.post('/api/admin/wallet/add-credits', async (req, res) => {
  try {
    const { userId, amount, description, adminId } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID or amount' });
    }

    const result = await walletService.addCredits(userId, amount, description || 'Admin credit adjustment', adminId);

    adminService.logActivity(
      adminId,
      'add_credits',
      userId,
      `Added $${amount} credits: ${description}`,
      req.ip
    );

    res.json({ success: true, newBalance: result.newBalance });
  } catch (error) {
    console.error('Error adding credits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user wallet balance
app.get('/api/wallet/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const balance = await walletService.getBalance(userId);
    res.json({ success: true, balance });
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get wallet transactions
app.get('/api/wallet/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const transactions = await walletService.getTransactions(userId, limit, offset);
    res.json({ success: true, transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get usage statistics
app.get('/api/wallet/usage-stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const stats = await walletService.getUsageStats(userId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get service pricing
app.get('/api/wallet/pricing', async (req, res) => {
  try {
    const pricing = await walletService.getServicePricing();
    res.json({ success: true, pricing });
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get service limits for a user
app.get('/api/admin/users/:userId/limits', async (req, res) => {
  try {
    const { userId } = req.params;
    const limits = await adminService.getUserServiceLimits(userId);
    res.json({ success: true, limits });
  } catch (error) {
    console.error('Error fetching service limits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create billing record
app.post('/api/admin/billing', async (req, res) => {
  try {
    const { userId, periodStart, periodEnd, usageData, platformFee, adminId } = req.body;

    const result = await adminService.createBillingRecord(
      userId,
      periodStart,
      periodEnd,
      usageData,
      platformFee
    );

    adminService.logActivity(
      adminId,
      'create_billing',
      userId,
      `Created billing record for period ${periodStart} to ${periodEnd}`,
      req.ip
    );

    res.json(result);
  } catch (error) {
    console.error('Error creating billing record:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update billing status
app.patch('/api/admin/billing/:billingId', async (req, res) => {
  try {
    const { billingId } = req.params;
    const { status, notes, adminId } = req.body;

    if (!['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid billing status' });
    }

    const result = await adminService.updateBillingStatus(billingId, status, notes);

    adminService.logActivity(
      adminId,
      'update_billing_status',
      null,
      `Updated billing ${billingId} status to ${status}`,
      req.ip
    );

    res.json(result);
  } catch (error) {
    console.error('Error updating billing status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== END ADMIN PANEL ENDPOINTS ====================

// ==================== COMPANIES ENDPOINTS ====================

// Get all companies for a user
app.get('/api/companies/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Ensure current_company_id exists in users table
    try {
      await mysqlPool.execute('ALTER TABLE users ADD COLUMN current_company_id VARCHAR(36) NULL');
    } catch (err) { /* ignore if already exists or other error */ }

    // Check if table exists, if not we fall back to empty list so frontend doesn't break
    try {
      const [companies] = await mysqlPool.execute('SELECT * FROM companies WHERE user_id = ? ORDER BY created_at DESC', [userId]);
      res.json({ success: true, companies });
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        // Auto-create companies table if missing
        await mysqlPool.execute(`
            CREATE TABLE companies (
              id VARCHAR(36) PRIMARY KEY,
              user_id VARCHAR(36) NOT NULL,
              name VARCHAR(255) NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
          `);
        res.json({ success: true, companies: [] });
      } else {
        throw err;
      }
    }
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a new company
app.post('/api/companies/create', async (req, res) => {
  try {
    const { userId, name } = req.body;
    if (!name || !userId) {
      return res.status(400).json({ success: false, message: 'Name and userId required' });
    }
    const { v4: uuidv4 } = require('uuid');
    const companyId = uuidv4();
    await mysqlPool.execute(
      'INSERT INTO companies (id, user_id, name) VALUES (?, ?, ?)',
      [companyId, userId, name]
    );

    // If first company, set as active
    const [companies] = await mysqlPool.execute('SELECT count(id) as count FROM companies WHERE user_id = ?', [userId]);
    if (companies[0].count === 1) {
      await mysqlPool.execute('UPDATE users SET current_company_id = ? WHERE id = ?', [companyId, userId]);
    }

    res.json({
      success: true,
      company: { id: companyId, user_id: userId, name }
    });
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Switch active company
app.post('/api/companies/switch', async (req, res) => {
  try {
    const { userId, companyId } = req.body;
    if (!companyId || !userId) {
      return res.status(400).json({ success: false, message: 'Company ID and user ID required' });
    }

    await mysqlPool.execute('UPDATE users SET current_company_id = ? WHERE id = ?', [companyId, userId]);

    res.json({ success: true, message: 'Switched successfully' });
  } catch (error) {
    console.error('Error switching company:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== END COMPANIES ENDPOINTS ====================

// ==================== ADMIN ANALYTICS ENDPOINTS ====================

// Get total companies count
app.get('/api/admin/stats/companies', async (req, res) => {
  try {
    const [result] = await mysqlPool.execute('SELECT COUNT(*) as total FROM companies');
    res.json({ success: true, totalCompanies: result[0].total });
  } catch (error) {
    console.error('Error fetching company count:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get total credits used across all users
app.get('/api/admin/stats/credits', async (req, res) => {
  try {
    const [result] = await mysqlPool.execute(`
      SELECT COALESCE(SUM(ABS(amount)), 0) as total_credits_used
      FROM wallet_transactions
      WHERE transaction_type = 'debit'
    `);
    const totalCreditsUsed = parseFloat(result[0].total_credits_used) || 0;
    res.json({ success: true, totalCreditsUsed });
  } catch (error) {
    // Graceful fallback
    res.json({ success: true, totalCreditsUsed: 0 });
  }
});

// ==================== END ADMIN ANALYTICS ENDPOINTS ====================


// ==================== SNOWFALL SETTINGS ENDPOINTS ====================

// In-memory storage for snowfall setting (you can move this to database if needed)
let globalSnowfallEnabled = false;

// Get snowfall setting (public endpoint - all users can check)
app.get('/api/admin/settings/snowfall', async (req, res) => {
  try {
    res.json({ success: true, enabled: globalSnowfallEnabled });
  } catch (error) {
    console.error('Error fetching snowfall setting:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle snowfall setting (admin only)
app.post('/api/admin/settings/snowfall/toggle', async (req, res) => {
  try {
    const { adminId, enabled } = req.body;

    if (!adminId) {
      return res.status(401).json({ success: false, message: 'Admin authentication required' });
    }

    // Update global setting
    globalSnowfallEnabled = enabled !== undefined ? enabled : !globalSnowfallEnabled;

    // Log admin activity
    adminService.logActivity(
      adminId,
      'toggle_snowfall',
      null,
      `Set snowfall effect to: ${globalSnowfallEnabled ? 'enabled' : 'disabled'}`,
      req.ip
    );

    console.log(`ðŸŽ„ Snowfall effect ${globalSnowfallEnabled ? 'enabled' : 'disabled'} by admin ${adminId}`);

    res.json({
      success: true,
      enabled: globalSnowfallEnabled,
      message: `Snowfall effect ${globalSnowfallEnabled ? 'enabled' : 'disabled'} for all users`
    });
  } catch (error) {
    console.error('Error toggling snowfall setting:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== END SNOWFALL SETTINGS ENDPOINTS ====================

// Get all API keys for a user (metadata only)
app.get('/api/user-api-keys/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const apiKeys = await ApiKeyService.getUserApiKeysMetadata(userId);
    res.json({ success: true, apiKeys });
  } catch (error) {
    console.error('Error fetching user API keys:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Get a specific API key for a user and service
app.get('/api/user-api-keys/:userId/:serviceName', async (req, res) => {
  try {
    const { userId, serviceName } = req.params;
    const apiKey = await ApiKeyService.getUserApiKey(userId, serviceName);
    if (!apiKey) {
      return res.status(404).json({ success: false, message: 'API key not found' });
    }

    const maskedKey = apiKey.substring(0, 4) + '*'.repeat(Math.max(0, apiKey.length - 4));
    res.json({ success: true, apiKey: maskedKey });
  } catch (error) {
    console.error('Error fetching user API key:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Set Google Sheets URL for campaign
app.post('/api/campaigns/:id/set-google-sheet', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, googleSheetUrl } = req.body;

    if (!userId || !googleSheetUrl) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Google Sheet URL are required'
      });
    }

    // Extract spreadsheet ID
    const spreadsheetId = googleSheetsService.extractSpreadsheetId(googleSheetUrl);

    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google Sheets URL'
      });
    }

    // Validate spreadsheet access
    const validation = await googleSheetsService.validateSpreadsheet(spreadsheetId);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: `Cannot access spreadsheet: ${validation.error}. Make sure you've shared it with the service account email.`
      });
    }

    // Initialize headers in the sheet
    await googleSheetsService.initializeHeaders(spreadsheetId, 'Call Logs');

    // Update campaign
    await mysqlPool.execute(
      'UPDATE campaigns SET google_sheet_url = ? WHERE id = ? AND user_id = ?',
      [googleSheetUrl, id, userId]
    );

    const updatedCampaign = await campaignService.getCampaign(id, userId);

    res.json({
      success: true,
      data: updatedCampaign,
      message: `Connected to spreadsheet: ${validation.title}`
    });

  } catch (error) {
    console.error('Error setting Google Sheet URL:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test Google Sheets connection
app.post('/api/google-sheets/test', async (req, res) => {
  try {
    const { googleSheetUrl } = req.body;

    if (!googleSheetUrl) {
      return res.status(400).json({
        success: false,
        message: 'Google Sheet URL is required'
      });
    }

    const spreadsheetId = googleSheetsService.extractSpreadsheetId(googleSheetUrl);

    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google Sheets URL'
      });
    }

    const validation = await googleSheetsService.validateSpreadsheet(spreadsheetId);

    if (validation.valid) {
      res.json({
        success: true,
        message: `Successfully connected to: ${validation.title}`,
        spreadsheetTitle: validation.title
      });
    } else {
      res.status(400).json({
        success: false,
        message: `Cannot access spreadsheet: ${validation.error}`
      });
    }

  } catch (error) {
    console.error('Error testing Google Sheets:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Manually log a call to Google Sheets
app.post('/api/google-sheets/log-call', async (req, res) => {
  try {
    const { campaignId, recordId, userId } = req.body;

    if (!campaignId || !recordId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID and Record ID are required'
      });
    }

    // Get campaign
    const campaign = await campaignService.getCampaign(campaignId, userId);
    if (!campaign || !campaign.google_sheet_url) {
      return res.status(400).json({
        success: false,
        message: 'Campaign does not have Google Sheets configured'
      });
    }

    // Get record details from campaign_contacts table
    const [records] = await mysqlPool.execute(
      'SELECT * FROM campaign_contacts WHERE id = ? AND campaign_id = ?',
      [recordId, campaignId]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    const record = records[0];

    // Get agent details
    let agentName = 'Unknown';
    if (campaign.agent_id) {
      const agent = await agentService.getAgentById(userId, campaign.agent_id);
      if (agent) agentName = agent.name;
    }

    // Log to Google Sheets
    const spreadsheetId = googleSheetsService.extractSpreadsheetId(campaign.google_sheet_url);
    const result = await googleSheetsService.logCallData(spreadsheetId, {
      phone: record.phone_number,  // Fixed: use phone_number instead of phone
      callStatus: record.status,    // Fixed: use status instead of call_status
      duration: record.call_duration || 0,  // Fixed: use call_duration
      callSid: record.call_id,      // Fixed: use call_id instead of call_sid
      recordingUrl: '',             // campaign_contacts doesn't have recording_url
      agentName: agentName,
      campaignName: campaign.name,
      retries: record.attempts || 0,  // Fixed: use attempts instead of retries
      metadata: record.metadata ? JSON.parse(record.metadata) : {}
    });

    res.json(result);

  } catch (error) {
    console.error('Error logging call to Google Sheets:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== END GOOGLE SHEETS ENDPOINTS ====================


app.post('/api/twilio/status', async (req, res) => {
  try {
    // contactId is the campaign_contacts.id passed in statusCallback URL
    const { contactId, callId } = req.query;
    const { CallSid, CallStatus, CallDuration } = req.body;

    console.log(' Twilio status callback:', {
      contactId,
      callId,
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration
    });

    // Update campaign_contacts status in real-time via campaignService
    if (contactId) {
      try {
        await campaignService.updateContactStatus(
          contactId,
          CallStatus,
          CallDuration ? parseInt(CallDuration) : null,
          CallSid
        );
      } catch (err) {
        console.error('Error updating campaign contact status:', err.message);
      }
    }

    // Also update the calls table if callId is provided
    if (callId) {
      try {
        const statusMap = {
          'queued': 'pending',
          'initiated': 'initiated',
          'ringing': 'ringing',
          'in-progress': 'in-progress',
          'completed': 'completed',
          'failed': 'failed',
          'busy': 'busy',
          'no-answer': 'no-answer',
          'canceled': 'canceled'
        };
        const mappedStatus = statusMap[CallStatus] || CallStatus;

        await mysqlPool.execute(
          `UPDATE calls SET status = ?, ${CallDuration ? 'duration = ?,' : ''} ${['completed', 'failed', 'busy', 'no-answer'].includes(CallStatus) ? 'ended_at = NOW(),' : ''} call_sid = ? WHERE id = ?`,
          [
            mappedStatus,
            ...(CallDuration ? [parseInt(CallDuration)] : []),
            CallSid,
            callId
          ].filter(v => v !== undefined)
        );
      } catch (err) {
        console.error('Error updating calls table:', err.message);
      }
    }

    // Broadcast status update via WebSocket to connected clients
    try {
      if (contactId) {
        const [contacts] = await mysqlPool.execute(
          'SELECT campaign_id, status, intent FROM campaign_contacts WHERE id = ?',
          [contactId]
        );
        if (contacts.length > 0) {
          const campaignId = contacts[0].campaign_id;
          // Notify all connected WebSocket clients about this update
          if (global.wssClients) {
            global.wssClients.forEach(client => {
              try {
                client.send(JSON.stringify({
                  event: 'lead_status_update',
                  contactId,
                  campaignId,
                  status: contacts[0].status,
                  twilioStatus: CallStatus
                }));
              } catch (e) { /* ignore closed sockets */ }
            });
          }
        }
      }
    } catch (broadcastErr) {
      console.error('Error broadcasting status update:', broadcastErr.message);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Error processing Twilio status callback:', error);
    res.status(200).send('OK'); // Always return 200 to Twilio
  }
});

// Twilio recording status callback - handles recording completion
app.post('/api/twilio/recording-status', async (req, res) => {
  try {
    const { contactId } = req.query;
    const { RecordingUrl, RecordingSid, CallSid } = req.body;

    console.log('Twilio recording status callback:', {
      contactId,
      recordingSid: RecordingSid,
      callSid: CallSid,
      recordingUrl: RecordingUrl
    });

    if (contactId && RecordingUrl) {
      // Get the call_id from campaign_contacts
      const [contacts] = await mysqlPool.execute(
        'SELECT call_id, campaign_id FROM campaign_contacts WHERE id = ?',
        [contactId]
      );

      if (contacts.length > 0 && contacts[0].call_id) {
        const callId = contacts[0].call_id;
        const campaignId = contacts[0].campaign_id;

        // Update the calls table with recording URL
        await mysqlPool.execute(
          'UPDATE calls SET recording_url = ? WHERE id = ?',
          [RecordingUrl, callId]
        );

        console.log(` Recording URL saved for call ${callId}: ${RecordingUrl}`);

        // Get campaign to check if Google Sheets is configured
        const [campaigns] = await mysqlPool.execute(
          'SELECT google_sheet_url, user_id, agent_id FROM campaigns WHERE id = ?',
          [campaignId]
        );

        if (campaigns.length > 0 && campaigns[0].google_sheet_url) {
          // Re-log to Google Sheets with the recording URL
          // Get contact details
          const [contactDetails] = await mysqlPool.execute(
            `SELECT cc.*, c.name as campaign_name 
             FROM campaign_contacts cc
             JOIN campaigns c ON cc.campaign_id = c.id
             WHERE cc.id = ?`,
            [contactId]
          );

          if (contactDetails.length > 0) {
            const contact = contactDetails[0];

            // Update the Google Sheets row with recording URL
            try {
              const googleSheetsService = require('./services/googleSheetsService.js');
              const spreadsheetId = googleSheetsService.extractSpreadsheetId(campaigns[0].google_sheet_url);

              // Find and update the row with this phone number and timestamp
              // For simplicity, we'll append a new row with updated info
              await googleSheetsService.logCallData(spreadsheetId, {
                phone: contact.phone_number,
                callStatus: contact.status,
                duration: contact.call_duration || 0,
                callSid: CallSid,
                recordingUrl: RecordingUrl,
                agentName: 'Campaign Agent',
                campaignName: contact.campaign_name,
                retries: contact.attempts || 0,
                metadata: contact.metadata ? JSON.parse(contact.metadata) : {}
              });

              console.log(` Updated Google Sheets with recording URL for ${contact.phone_number}`);
            } catch (error) {
              console.error('Failed to update Google Sheets with recording URL:', error.message);
            }
          }
        }
      }
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Error processing Twilio recording status callback:', error);
    res.status(200).send('OK');
  }
});

// Update the processCampaignCalls function to include Google Sheets logging
async function processCampaignCalls(campaignId, userId, campaign, records) {
  console.log(`Processing campaign ${campaignId} with ${records.length} records`);

  const verifiedNumbers = await twilioService.getVerifiedNumbers(userId);
  const twilioNumber = verifiedNumbers.find(num => num.phoneNumber === campaign.callerPhone);

  if (!twilioNumber) {
    console.error('Twilio number not found:', campaign.callerPhone);
    return;
  }

  // Get agent details for logging
  let agentName = 'Unknown';
  if (campaign.agentId) {
    try {
      const agent = await agentService.getAgentById(userId, campaign.agentId);
      if (agent) agentName = agent.name;
    } catch (error) {
      console.error('Error fetching agent:', error);
    }
  }

  // Get spreadsheet ID if configured
  let spreadsheetId = null;
  if (campaign.google_sheet_url) {
    spreadsheetId = googleSheetsService.extractSpreadsheetId(campaign.google_sheet_url);
  }

  for (const record of records) {
    try {
      const currentCampaign = await campaignService.getCampaign(campaignId, userId);
      if (currentCampaign.status !== 'running') {
        console.log('Campaign stopped, exiting...');
        break;
      }

      await campaignService.updateRecordStatus(record.id, 'in-progress');

      const callId = uuidv4();
      const appUrl = getBackendUrl();
      const cleanAppUrl = normalizeBackendUrl(appUrl);

      const call = await twilioService.createCall({
        userId: userId,
        twilioNumberId: twilioNumber.id,
        to: record.phone,
        agentId: campaign.agentId,
        callId: callId,
        appUrl: cleanAppUrl
      });

      await campaignService.updateRecordCallSid(record.id, call.sid);

      // Log to Google Sheets immediately after call is initiated
      if (spreadsheetId) {
        await googleSheetsService.logCallData(spreadsheetId, {
          phone: record.phone,
          callStatus: 'initiated',
          duration: 0,
          callSid: call.sid,
          recordingUrl: '',
          agentName: agentName,
          campaignName: campaign.name,
          retries: record.retries || 0,
          notes: 'Call initiated',
          metadata: {}
        });
      }

      console.log(`Call initiated for ${record.phone}: ${call.sid}`);

      await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
      console.error(`Error calling ${record.phone}:`, error);
      await campaignService.updateRecordStatus(record.id, 'failed');
      await campaignService.incrementRecordRetry(record.id);

      // Log failure to Google Sheets
      if (spreadsheetId) {
        await googleSheetsService.logCallData(spreadsheetId, {
          phone: record.phone,
          callStatus: 'failed',
          duration: 0,
          callSid: '',
          recordingUrl: '',
          agentName: agentName,
          campaignName: campaign.name,
          retries: (record.retries || 0) + 1,
          notes: error.message,
          metadata: {}
        });
      }
    }
  }

  console.log(`Campaign ${campaignId} processing complete`);
}
// Save or update an API key for a user
app.post('/api/user-api-keys', async (req, res) => {
  try {
    const { userId, serviceName, apiKey } = req.body;
    if (!userId || !serviceName || !apiKey) {
      return res.status(400).json({ success: false, message: 'User ID, service name, and API key are required' });
    }

    await ApiKeyService.saveUserApiKey(userId, serviceName, apiKey);
    res.json({ success: true, message: 'API key saved successfully' });
  } catch (error) {
    console.error('Error saving user API key:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete an API key for a user and service
app.delete('/api/user-api-keys/:userId/:serviceName', async (req, res) => {
  try {
    const { userId, serviceName } = req.params;
    await ApiKeyService.deleteUserApiKey(userId, serviceName);
    res.json({ success: true, message: 'API key deleted successfully' });
  } catch (error) {
    console.error('Error deleting user API key:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Validate an API key
app.post('/api/validate-api-key', async (req, res) => {
  try {
    const { userId, serviceName, apiKey } = req.body;
    if (!userId || !serviceName || !apiKey) {
      return res.status(400).json({ success: false, message: 'User ID, service name, and API key are required' });
    }

    const isValid = await ApiKeyService.validateApiKey(userId, serviceName, apiKey);
    res.json({ success: true, valid: isValid });
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ElevenLabs voices endpoint - fetch all voices from ElevenLabs API
app.get('/api/voices/elevenlabs', async (req, res) => {
  try {
    // Get ElevenLabs API key from environment variables
    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
      console.error('ElevenLabs API key not configured on server');
      return res.status(500).json({ success: false, message: 'ElevenLabs API key not configured on server' });
    }

    console.log('Fetching voices from ElevenLabs API with key:', apiKey.substring(0, 4) + '...');

    // Fetch voices from ElevenLabs API
    const response = await nodeFetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey
      }
    });

    console.log('ElevenLabs API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);

      // Check if the response is HTML (error page)
      if (errorText.startsWith('<!DOCTYPE') || errorText.includes('<html')) {
        return res.status(500).json({
          success: false,
          message: 'ElevenLabs API returned an HTML error page. Check API key and network connectivity.'
        });
      }

      return res.status(response.status).json({
        success: false,
        message: `ElevenLabs API error: ${response.statusText} - ${errorText}`
      });
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const errorText = await response.text();
      console.error('ElevenLabs API returned non-JSON response:', errorText.substring(0, 200));
      return res.status(500).json({
        success: false,
        message: 'ElevenLabs API returned invalid response format. Expected JSON.'
      });
    }

    const data = await response.json();

    // Return voices with full metadata
    res.json({
      success: true,
      voices: data.voices
    });
  } catch (error) {
    console.error('Error fetching ElevenLabs voices:', error);
    res.status(500).json({ success: false, message: `Error fetching ElevenLabs voices: ${error.message}` });
  }
});
// Fetch ElevenLabs credits
app.get('/api/credits/elevenlabs/:userId', async (req, res) => {
  try {
    // Use shared ElevenLabs API key from environment
    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
      return res.status(404).json({ success: false, message: 'ElevenLabs API key not configured' });
    }

    const response = await nodeFetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: {
        'xi-api-key': apiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ElevenLabs API error: ${response.status} - ${response.statusText}`, errorText);
      return res.status(response.status).json({ success: false, message: `ElevenLabs API error: ${response.statusText}` });
    }

    const data = await response.json();
    const credits = data.character_count || 0;
    res.json({ success: true, credits });
  } catch (error) {
    console.error('Error fetching ElevenLabs credits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Fetch Google Gemini credits
app.get('/api/credits/gemini/:userId', async (req, res) => {
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(404).json({ success: false, message: 'Google Gemini API key not configured' });
    }

    const response = await nodeFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error: ${response.status} - ${response.statusText}`, errorText);
      return res.status(response.status).json({ success: false, message: `Gemini API error: ${response.statusText}` });
    }

    const data = await response.json();
    const modelCount = data.models && data.models.length > 0 ? data.models.length : 0;
    res.json({ success: true, credits: modelCount });
  } catch (error) {
    console.error('Error fetching Google Gemini credits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Fetch Deepgram credits
app.get('/api/credits/deepgram/:userId', async (req, res) => {
  try {
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return res.status(400).json({ success: false, message: 'Deepgram API key not configured' });
    }

    // First, get the project ID associated with this API key
    const projectsResponse = await nodeFetch('https://api.deepgram.com/v1/projects', {
      method: 'GET',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!projectsResponse.ok) {
      const errorText = await projectsResponse.text();
      console.error(`Deepgram API error (projects): ${projectsResponse.status} - ${projectsResponse.statusText}`, errorText);

      // Return 0 credits if API key is invalid or endpoint returns error
      return res.json({
        success: true,
        credits: 0,
        message: 'Deepgram API key may be invalid or expired'
      });
    }

    const projectsData = await projectsResponse.json();

    // Get the first project (usually there's only one)
    if (!projectsData.projects || projectsData.projects.length === 0) {
      return res.json({
        success: true,
        credits: 0,
        message: 'No Deepgram projects found'
      });
    }

    const projectId = projectsData.projects[0].project_id;

    // Now fetch the balances for this project
    const balancesResponse = await nodeFetch(`https://api.deepgram.com/v1/projects/${projectId}/balances`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!balancesResponse.ok) {
      const errorText = await balancesResponse.text();
      console.error(`Deepgram API error (balances): ${balancesResponse.status} - ${balancesResponse.statusText}`, errorText);

      return res.json({
        success: true,
        credits: 0,
        message: 'Unable to fetch balance'
      });
    }

    const balancesData = await balancesResponse.json();

    // Sum all balances (usually just one)
    const totalBalance = balancesData.balances && balancesData.balances.length > 0
      ? balancesData.balances.reduce((sum, balance) => sum + (balance.amount || 0), 0)
      : 0;

    res.json({ success: true, credits: totalBalance });
  } catch (error) {
    console.error('Error fetching Deepgram credits:', error);
    // Return 0 on error instead of failing
    res.json({ success: true, credits: 0, message: 'Unable to fetch Deepgram credits' });
  }
});

// Get credit transactions for a user
app.get('/api/credits/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const [transactions] = await mysqlPool.execute(
      'SELECT id, user_id, transaction_type, service_type, amount, description, created_at FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [userId]
    );

    res.json({
      success: true,
      transactions: transactions.map(t => ({
        id: t.id,
        userId: t.user_id,
        transactionType: t.transaction_type,
        serviceType: t.service_type,
        amount: t.amount,
        description: t.description,
        createdAt: t.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching credit transactions:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all phone numbers for a user
// Returns 'data' (from phone_numbers table, legacy) AND 'phoneNumbers' (from user_twilio_numbers, for campaign dropdowns)
app.get('/api/phone-numbers', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Legacy phone_numbers table data
    const phoneNumbers = await PhoneNumberService.getPhoneNumbers(userId);

    // Also fetch from user_twilio_numbers (for campaign caller phone dropdown)
    const [twilioRows] = await mysqlPool.execute(
      `SELECT id, phone_number, region, verified,
              (twilio_account_sid IS NOT NULL) AS has_credentials
       FROM user_twilio_numbers
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: phoneNumbers,           // legacy
      phoneNumbers: twilioRows      // for campaign dropdown
    });
  } catch (error) {
    console.error('Error fetching phone numbers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get a specific phone number by ID
app.get('/api/phone-numbers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const phoneNumber = await PhoneNumberService.getPhoneNumberById(userId, id);
    if (!phoneNumber) {
      return res.status(404).json({ success: false, message: 'Phone number not found' });
    }

    res.json({ success: true, data: phoneNumber });
  } catch (error) {
    console.error('Error fetching phone number:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a new phone number
app.post('/api/phone-numbers', async (req, res) => {
  try {
    const { userId, phoneNumber } = req.body;
    if (!userId || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'User ID and phone number data are required' });
    }

    const newPhoneNumber = await PhoneNumberService.createPhoneNumber(userId, phoneNumber);
    res.json({ success: true, data: newPhoneNumber });
  } catch (error) {
    console.error('Error creating phone number:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update an existing phone number
app.put('/api/phone-numbers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, ...updateData } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Check if phone number exists and belongs to user first
    const existingPhoneNumber = await PhoneNumberService.getPhoneNumberById(userId, id);
    if (!existingPhoneNumber) {
      return res.status(404).json({ success: false, message: 'Phone number not found' });
    }

    const updatedPhoneNumber = await PhoneNumberService.updatePhoneNumber(userId, id, updateData);
    res.json({ success: true, data: updatedPhoneNumber });
  } catch (error) {
    console.error('Error updating phone number:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete a phone number
app.delete('/api/phone-numbers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    await PhoneNumberService.deletePhoneNumber(userId, id);
    res.json({ success: true, message: 'Phone number deleted successfully' });
  } catch (error) {
    console.error('Error deleting phone number:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Import a phone number
app.post('/api/phone-numbers/import', async (req, res) => {
  try {
    const { userId, phoneNumber } = req.body;
    if (!userId || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'User ID and phone number data are required' });
    }

    const importedPhoneNumber = await PhoneNumberService.importPhoneNumber(userId, phoneNumber);
    res.json({ success: true, data: importedPhoneNumber });
  } catch (error) {
    console.error('Error importing phone number:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Twilio endpoints
// Validate Twilio credentials
app.post('/api/validate-twilio-credentials', async (req, res) => {
  try {
    const { accountSid, authToken } = req.body;
    console.log(`[Twilio] Validating credentials for SID: ${accountSid ? accountSid.substring(0, 8) + '...' : 'MISSING'}`);

    if (!accountSid || !authToken) {
      return res.status(400).json({ success: false, message: 'Account SID and Auth Token are required' });
    }

    const client = twilio(accountSid, authToken);
    await client.api.accounts(accountSid).fetch();

    console.log('[Twilio] Credentials validated successfully');
    res.json({ success: true, message: 'Credentials are valid' });
  } catch (error) {
    console.error('Error validating Twilio credentials:', error.message);
    res.status(401).json({ success: false, message: 'Invalid Twilio credentials: ' + error.message });
  }
});

// Fetch available Twilio phone numbers
app.post('/api/fetch-twilio-numbers', async (req, res) => {
  try {
    const { accountSid, authToken } = req.body;
    if (!accountSid || !authToken) {
      return res.status(400).json({ success: false, message: 'Account SID and Auth Token are required' });
    }

    const client = twilio(accountSid, authToken);

    // Fetch all incoming phone numbers from Twilio account
    const incomingNumbers = await client.incomingPhoneNumbers.list({ limit: 100 });

    // Format the response
    const formattedNumbers = incomingNumbers.map(num => ({
      phoneNumber: num.phoneNumber,
      friendlyName: num.friendlyName,
      sid: num.sid,
      capabilities: {
        voice: num.capabilities?.voice || false,
        sms: num.capabilities?.sms || false,
        mms: num.capabilities?.mms || false
      }
    }));

    res.json({ success: true, data: formattedNumbers });
  } catch (error) {
    console.error('Error fetching Twilio numbers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch phone numbers: ' + error.message });
  }
});

// Fetch phone numbers from user's Twilio account
app.post('/api/twilio/fetch-account-numbers', async (req, res) => {
  try {
    const { userId, accountSid } = req.body;
    if (!userId || !accountSid) {
      return res.status(400).json({ success: false, message: 'User ID and Account SID are required' });
    }

    const phoneNumbers = await twilioService.fetchPhoneNumbersFromUserAccount(userId, accountSid);

    res.json({ success: true, data: phoneNumbers });
  } catch (error) {
    console.error('Error fetching phone numbers from user account:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add phone number from user's Twilio account
app.post('/api/twilio/add-account-number', async (req, res) => {
  try {
    const { userId, accountSid, phoneNumber, region } = req.body;
    if (!userId || !accountSid || !phoneNumber || !region) {
      return res.status(400).json({ success: false, message: 'User ID, Account SID, phone number, and region are required' });
    }

    const result = await twilioService.addPhoneNumberFromAccount(userId, accountSid, phoneNumber, region);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error adding phone number from account:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// Get Twilio calls for a user
app.get('/api/twilio/calls/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // For now, return empty array - in production, fetch from database
    res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error fetching Twilio calls:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Twilio phone numbers for a user
app.get('/api/twilio/phone-numbers/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // For now, return empty array - in production, fetch from database
    res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error fetching Twilio phone numbers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Start a call endpoint (for frontend compatibility)
// Start a call endpoint (for frontend compatibility)
app.post('/call/start', async (req, res) => {
  try {
    const { userId, from, to, agentId } = req.body;

    if (!userId || !from || !to || !agentId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Validate phone number formats
    if (!/^\+?[1-9]\d{1,14}$/.test(from)) {
      return res.status(400).json({ success: false, message: 'Invalid FROM number format' });
    }
    if (!/^\+?[1-9]\d{1,14}$/.test(to)) {
      return res.status(400).json({ success: false, message: 'Invalid TO number format' });
    }

    // Validate Twilio number belongs to user
    const userTwilioNumbers = await twilioService.getVerifiedNumbers(userId);
    const twilioNumber = userTwilioNumbers.find(num => num.id === from);

    if (!twilioNumber) {
      return res.status(400).json({
        success: false,
        message: 'From number must be a verified Twilio number for this user'
      });
    }

    // Generate call ID
    const callId = uuidv4();
    const database = mysqlPool;

    // Check if phone_number entry exists
    const [phoneRows] = await database.execute(
      'SELECT id FROM phone_numbers WHERE number = ? AND user_id = ?',
      [from, userId]
    );

    let phoneNumberId;
    if (phoneRows.length > 0) {
      phoneNumberId = phoneRows[0].id;
    } else {
      phoneNumberId = uuidv4();
      await database.execute(
        `INSERT INTO phone_numbers 
        (id, user_id, number, source, provider, created_at) 
        VALUES (?, ?, ?, 'twilio', 'twilio', NOW())`,
        [phoneNumberId, userId, from]
      );
    }

    // Insert call into DB
    await database.execute(
      `INSERT INTO calls 
      (id, phone_number_id, user_id, agent_id, from_number, to_number, status, twilio_number_id, started_at)
      VALUES (?, ?, ?, ?, ?, ?, 'initiated', ?, NOW())`,
      [callId, phoneNumberId, userId, agentId, from, to, twilioNumber.id]
    );

    // Prepare Twilio call
    const appUrl = getBackendUrl();
    const cleanAppUrl = normalizeBackendUrl(appUrl);

    const call = await twilioService.createCall({
      userId,
      twilioNumberId: twilioNumber.id,
      to,
      agentId,
      callId,
      appUrl: cleanAppUrl
    });

    // Save Twilio SID
    await database.execute(
      'UPDATE calls SET call_sid = ? WHERE id = ?',
      [call.sid, callId]
    );

    res.json({
      success: true,
      data: {
        callId,
        callSid: call.sid
      }
    });

  } catch (error) {
    console.error("Error starting call:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Make Twilio call
app.post('/api/twilio/make-call', async (req, res) => {
  try {
    const { userId, from, to, agentId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Validate user ID format (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return res.status(400).json({ success: false, message: 'User ID must be a valid UUID' });
    }

    if (!from) {
      return res.status(400).json({ success: false, message: 'From number is required' });
    }

    if (!to) {
      return res.status(400).json({ success: false, message: 'To number is required' });
    }

    if (!agentId) {
      return res.status(400).json({ success: false, message: 'Agent ID is required' });
    }

    // Get all verified Twilio numbers for this user
    const userTwilioNumbers = await twilioService.getVerifiedNumbers(userId);

    // Find the Twilio number record by ID (from is a UUID from user_twilio_numbers.id)
    let twilioNumber = userTwilioNumbers.find(num => num.id === from);

    // If not found by ID, try finding by phone number (fallback)
    if (!twilioNumber) {
      twilioNumber = userTwilioNumbers.find(num => num.phoneNumber === from);
    }

    if (!twilioNumber) {
      return res.status(400).json({
        success: false,
        message: 'From number must be a verified Twilio number for this user'
      });
    }

    // Extract the actual phone number from the twilioNumber object
    const fromPhoneNumber = twilioNumber.phoneNumber;

    // Validate phone number formats
    if (!/^\+?[1-9]\d{1,14}$/.test(fromPhoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'From number must be a valid Twilio number in E.164 format (e.g., +1234567890)'
      });
    }

    if (!/^\+?[1-9]\d{1,14}$/.test(to)) {
      return res.status(400).json({
        success: false,
        message: 'To number must be in E.164 format (e.g., +1234567890)'
      });
    }

    // Generate a unique call ID
    const callId = require('uuid').v4();

    // Get app URL for callbacks - MUST be a public URL for Twilio
    const appUrl = getBackendUrl();

    if (!appUrl) {
      console.error('ERROR: APP_URL environment variable is not set!');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: APP_URL is not configured. Please contact administrator.'
      });
    }

    if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
      console.error('ERROR: APP_URL is set to localhost, but Twilio requires a public URL!');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: APP_URL must be a public URL, not localhost. Please use ngrok or deploy to Railway.'
      });
    }

    const cleanAppUrl = normalizeBackendUrl(appUrl);
    console.log('Using APP_URL for Twilio webhooks:', cleanAppUrl);

    // Get or create phone_numbers entry for the from number
    const database = require('./config/database.js').default;

    const [phoneRows] = await database.execute(
      'SELECT id FROM phone_numbers WHERE user_id = ? AND phone_number = ?',
      [userId, fromPhoneNumber]
    );

    let phoneNumberId;
    if (phoneRows.length > 0) {
      phoneNumberId = phoneRows[0].id;
    } else {
      // Create phone_numbers entry if it doesn't exist
      phoneNumberId = require('uuid').v4();
      await database.execute(
        `INSERT INTO phone_numbers 
        (id, user_id, phone_number, source, provider, created_at) 
        VALUES (?, ?, ?, 'twilio', 'twilio', NOW())`,
        [phoneNumberId, userId, fromPhoneNumber]
      );
    }

    // Create call record in database with the ACTUAL PHONE NUMBER
    await database.execute(
      `INSERT INTO calls 
      (id, phone_number_id, user_id, agent_id, from_number, to_number, status, twilio_number_id, started_at)
      VALUES (?, ?, ?, ?, ?, ?, 'initiated', ?, NOW())`,
      [callId, phoneNumberId, userId, agentId, fromPhoneNumber, to, twilioNumber.id]
    );

    // Create the actual Twilio call
    // twilioService.createCall will use twilioNumber.phoneNumber internally
    const call = await twilioService.createCall({
      userId: userId,
      twilioNumberId: twilioNumber.id,
      to: to,
      agentId: agentId,
      callId: callId,
      appUrl: cleanAppUrl
    });

    // Update call record with Twilio call SID
    await database.execute(
      'UPDATE calls SET call_sid = ? WHERE id = ?',
      [call.sid, callId]
    );

    // Return success response
    res.json({
      success: true,
      data: {
        id: callId,
        userId,
        callSid: call.sid,
        fromNumber: fromPhoneNumber,
        toNumber: to,
        agentId: agentId,
        direction: 'outbound',
        status: 'initiated',
        timestamp: new Date().toISOString(),
        duration: 0
      }
    });

  } catch (error) {
    console.error('Error making Twilio call:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add Twilio number
app.post('/api/add-twilio-number', async (req, res) => {
  try {
    const { userId, phoneNumber, region, accountSid, authToken } = req.body;
    if (!userId || !phoneNumber || !region || !accountSid || !authToken) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Use TwilioService to add the number and store in database
    const result = await twilioService.addTwilioNumber(
      userId,
      phoneNumber,
      region,
      accountSid,
      authToken
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error adding Twilio number:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Twilio account management endpoints
// Get all Twilio accounts for a user
app.get('/api/twilio/accounts', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const database = mysqlPool;
    const [rows] = await database.execute(
      'SELECT id, name, account_sid, auth_token, created_at FROM user_twilio_accounts WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    // Decrypt auth tokens before sending to frontend
    const accounts = rows.map(row => ({
      id: row.id,
      name: row.name,
      accountSid: row.account_sid,
      authToken: row.auth_token, // In a real implementation, you would decrypt this
      createdAt: row.created_at
    }));

    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('Error fetching Twilio accounts:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add a Twilio account for a user
app.post('/api/twilio/accounts', async (req, res) => {
  try {
    const { userId, name, accountSid, authToken } = req.body;
    if (!userId || !name || !accountSid || !authToken) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const database = mysqlPool;
    const accountId = require('uuid').v4();

    // In a real implementation, you would encrypt the auth token before storing
    await database.execute(
      'INSERT INTO user_twilio_accounts (id, user_id, name, account_sid, auth_token, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [accountId, userId, name, accountSid, authToken]
    );

    res.json({ success: true, data: { id: accountId } });
  } catch (error) {
    console.error('Error adding Twilio account:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete a Twilio account
app.delete('/api/twilio/accounts/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const database = mysqlPool;
    await database.execute(
      'DELETE FROM user_twilio_accounts WHERE id = ? AND user_id = ?',
      [accountId, userId]
    );

    res.json({ success: true, message: 'Account removed successfully' });
  } catch (error) {
    console.error('Error deleting Twilio account:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// REPLACE your /api/twilio/voice endpoint in server.js with this version:
// ALTERNATIVE VERSION with explicit track settings:

app.post('/api/twilio/voice', async (req, res) => {
  try {
    const { CallSid, From, To } = req.body;
    const { userId, campaignId, agentId, callId } = req.query;

    console.log(' ========== TWILIO VOICE WEBHOOK ==========');
    console.log('   CallSid:', CallSid);
    console.log('   From:', From);
    console.log('   To:', To);
    console.log('   Query params:', { userId, campaignId, agentId, callId });

    if (!agentId) {
      console.error('Missing agentId in voice webhook');
      const VoiceResponse = require('twilio').twiml.VoiceResponse;
      const response = new VoiceResponse();
      response.say("Configuration error. Agent not specified.");
      response.hangup();
      res.type('text/xml');
      return res.send(response.toString());
    }

    let appUrl = getBackendUrl();
    if (!appUrl) {
      console.error('APP_URL not configured!');
      const VoiceResponse = require('twilio').twiml.VoiceResponse;
      const response = new VoiceResponse();
      response.say("Server configuration error.");
      response.hangup();
      res.type('text/xml');
      return res.send(response.toString());
    }

    // Ensure appUrl has protocol
    appUrl = ensureHttpProtocol(appUrl);

    // Twilio Media Streams expect a plain WebSocket URL.
    // Dynamic values are passed via nested <Parameter> elements instead.
    // Allow a dedicated WS base URL so production can bypass a frontend proxy
    // that does not forward WebSocket upgrades correctly.
    const actualCallId = callId || CallSid;
    const twilioWsBaseUrl = process.env.TWILIO_WS_BASE_URL || process.env.BACKEND_WS_BASE_URL || appUrl;
    // buildBackendWsUrl now extracts domain automatically, so pass just the path
    // ✅ Twilio Media Streams will send parameters in the "start" event, not in URL
    const baseStreamUrl = buildBackendWsUrl('/api/call', twilioWsBaseUrl);
    const streamUrl = baseStreamUrl; // No query params - Twilio sends them via "start" event with customParameters
    const streamStatusCallbackUrl =
      `${buildBackendUrl('/twilio/stream-status', appUrl)}?callId=${encodeURIComponent(actualCallId)}`;
    const streamFallbackUrl =
      `${buildBackendUrl('/twilio/stream-fallback', appUrl)}?callId=${encodeURIComponent(actualCallId)}`;

    console.log('🔗 WebSocket Stream URL:', streamUrl);
    if (twilioWsBaseUrl !== appUrl) {
      console.log('   Twilio WS base override:', twilioWsBaseUrl);
    }
    console.log('   CallSid:', CallSid);
    console.log('   agentId:', agentId);
    console.log('   userId:', userId);
    console.log('   contactId:', req.query.contactId);
    console.log('   campaignId:', campaignId);

    //  Create proper TwiML with Twilio SDK
    const VoiceResponse = require('twilio').twiml.VoiceResponse;
    const response = new VoiceResponse();

    // Connect directly to WebSocket stream (agent will send greeting)
    const connect = response.connect({
      action: streamFallbackUrl,
      method: 'POST'
    });

    const stream = connect.stream({
      url: streamUrl,
      name: `stream_${actualCallId}`,
      statusCallback: streamStatusCallbackUrl,
      statusCallbackMethod: 'POST'
    });

    //  CRITICAL: Add parameters to stream as redundancy (for Twilio Media Streams parameters)
    stream.parameter({ name: 'callId', value: actualCallId });
    stream.parameter({ name: 'agentId', value: agentId });
    stream.parameter({ name: 'userId', value: userId || '' });
    stream.parameter({ name: 'contactId', value: req.query.contactId || '' });
    stream.parameter({ name: 'campaignId', value: campaignId || '' });

    const twiml = response.toString();

    console.log('„ Generated TwiML:');
    console.log(twiml);
    console.log('=============================================');

    res.type('text/xml');
    res.send(twiml);

    // Update call status
    if (callId) {
      mysqlPool.execute(
        'UPDATE calls SET status = ? WHERE id = ?',
        ['in-progress', callId]
      ).catch(err => console.error('Error updating call status:', err));
    }
  } catch (error) {
    console.error('âŒ Voice webhook error:', error);

    const VoiceResponse = require('twilio').twiml.VoiceResponse;
    const response = new VoiceResponse();
    response.say("Technical error occurred.");
    response.hangup();

    res.type('text/xml');
    res.send(response.toString());
  }
});

// Stream fallback - keeps call alive if stream ends
app.post('/api/twilio/stream-fallback', (req, res) => {
  console.log(' Stream ended, keeping call alive...');
  const VoiceResponse = require('twilio').twiml.VoiceResponse;
  const response = new VoiceResponse();

  // Keep the call alive with a long pause
  response.pause({ length: 3600 }); // 1 hour pause (effectively keeps call alive)

  res.type('text/xml');
  res.send(response.toString());
});

app.post('/api/twilio/stream-status', (req, res) => {
  const { callId } = req.query;
  const {
    CallSid,
    StreamSid,
    StreamName,
    StreamEvent,
    StreamError,
    Timestamp
  } = req.body || {};

  // Only log errors or significant events, not every status update
  if (StreamError || StreamEvent === 'stream-stopped' || StreamEvent === 'stream-started') {
    console.log('🔄 Twilio stream status:', {
      callId,
      StreamEvent,
      StreamError: StreamError || 'none',
      Timestamp
    });
  }

  res.sendStatus(204);
});

// Twilio Status Callback
app.post('/api/twilio/callback', async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;
    const { callId } = req.query;

    console.log('Status callback:', { CallSid, CallStatus, CallDuration });

    const statusMap = {
      'queued': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'failed': 'failed',
      'no-answer': 'no-answer'
    };

    const status = statusMap[CallStatus] || CallStatus;

    if (callId) {
      await mysqlPool.execute(
        `UPDATE calls 
         SET status = ?, duration = ?,
             ended_at = CASE WHEN ? IN ('completed', 'busy', 'failed', 'no-answer') 
                        THEN NOW() ELSE ended_at END
         WHERE id = ?`,
        [status, CallDuration || 0, status, callId]
      );
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('âŒ Callback error:', error);
    res.status(500).send('Error');
  }
});

// Agent endpoints
// Get all agents for a user
app.get('/api/agents', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const agents = await agentService.getAgents(userId);

    // Return both 'data' (legacy) and 'agents' (new) so all consumers work
    res.json({
      success: true,
      data: agents,
      agents: agents   //  used by CampaignDetailPage dropdown
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get a specific agent by ID
app.get('/api/agents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const agent = await agentService.getAgentById(userId, id);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a new agent
app.post('/api/agents', async (req, res) => {
  try {
    const { userId, agent } = req.body;
    if (!userId || !agent) {
      return res.status(400).json({ success: false, message: 'User ID and agent data are required' });
    }

    const newAgent = await agentService.createAgent(userId, agent);
    res.json({ success: true, data: newAgent });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update an existing agent
app.put('/api/agents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Extract agent data (all properties except userId)
    const agentData = { ...req.body };
    delete agentData.userId;

    const updatedAgent = await agentService.updateAgent(userId, id, agentData);
    res.json({ success: true, data: updatedAgent });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete an agent
app.delete('/api/agents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    await agentService.deleteAgent(userId, id);
    res.json({ success: true, message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Campaign endpoints
app.get('/api/campaigns', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const campaigns = await campaignService.getUserCampaigns(userId);
    res.json({ success: true, data: campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all campaigns for an organization (used by Org Admin Dashboard)
app.get('/api/campaigns/org', async (req, res) => {
  try {
    const { orgId, limit } = req.query;
    const limitNum = parseInt(limit) || 10;
    
    let query = `
      SELECT c.*, u.username, u.email as user_email
      FROM campaigns c
      JOIN users u ON c.user_id = u.id
    `;
    const params = [];

    if (orgId && orgId !== 'null') {
      query += ` WHERE u.organization_id = ?`;
      params.push(parseInt(orgId));
    }
    
    query += ` ORDER BY c.created_at DESC LIMIT ${limitNum}`;
    
    const [campaigns] = await mysqlPool.execute(query, params);
    res.json({ success: true, campaigns });
  } catch (error) {
    console.error('Error fetching org campaigns:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Fetch user's current company ID
    const [user] = await mysqlPool.execute('SELECT current_company_id FROM users WHERE id = ?', [userId]);
    const companyId = user.length > 0 ? user[0].current_company_id : null;

    let query = `
      SELECT 
          cc.id, 
          cc.created_at, 
          c.name as campaignName, 
          a.name as agentName, 
          cc.phone_number as calledNumber, 
          'Outbound' as type,
          cc.status, 
          IFNULL(cc.intent, 'Pending') as result,
          cc.completed_at,
          cc.schedule_time,
          cc.call_duration,
          cl.recording_url
      FROM campaign_contacts cc
      JOIN campaigns c ON cc.campaign_id = c.id
      LEFT JOIN agents a ON c.agent_id = a.id
      LEFT JOIN calls cl ON cc.call_id = cl.call_sid
      WHERE c.user_id = ?
    `;

    const params = [userId];

    if (companyId) {
      query += ' AND c.company_id = ?';
      params.push(companyId);
    } else {
      query += ' AND (c.company_id IS NULL OR c.company_id = "")';
    }

    query += ' ORDER BY cc.created_at DESC';

    const [rows] = await mysqlPool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get a specific campaign by ID with records
app.get('/api/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const campaignData = await campaignService.getCampaignWithRecords(id, userId);
    if (!campaignData) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, data: campaignData });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a new campaign
app.post('/api/campaigns', async (req, res) => {
  try {
    const { userId, agentId, phoneNumberId, name, description, contacts, concurrentCalls, retryAttempts } = req.body;
    if (!userId || !name) {
      return res.status(400).json({ success: false, message: 'User ID and campaign name are required' });
    }

    // Create the campaign (agentId and phoneNumberId can be null)
    // pass concurrentCalls and retryAttempts
    const result = await campaignService.createCampaign(
      userId,
      agentId || null,
      name,
      description || '',
      phoneNumberId || null,
      concurrentCalls || 1,
      retryAttempts || 0
    );

    // Add contacts if provided
    if (contacts && contacts.length > 0) {
      await campaignService.addContacts(result.campaignId, contacts);
    }

    res.json({ success: true, campaignId: result.campaignId });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update a campaign
// Update a campaign - REMOVED DUPLICATE BROKEN ENDPOINT
// The correct PUT /api/campaigns/:id is defined later in the file (around line 4100)
// and handles updates directly via SQL since campaignService.updateCampaign doesn't exist.

// Delete a campaign
app.delete('/api/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    await campaignService.deleteCampaign(id, userId);
    res.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Set caller phone for a campaign
app.post('/api/campaigns/:id/set-caller-phone', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, callerPhone, agentId } = req.body;
    if (!userId || !callerPhone) {
      return res.status(400).json({ success: false, message: 'User ID and caller phone (ID) are required' });
    }

    // callerPhone is passed as phoneNumberId
    const updatedCampaign = await campaignService.setCallerPhone(id, userId, callerPhone, agentId);
    res.json({ success: true, campaign: updatedCampaign });
  } catch (error) {
    console.error('Error setting caller phone:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Import records (CSV)
app.post('/api/campaigns/:id/import', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, csvData } = req.body;
    if (!userId || !csvData) {
      return res.status(400).json({ success: false, message: 'User ID and CSV data are required' });
    }

    const result = await campaignService.addContacts(id, csvData);
    res.json(result);
  } catch (error) {
    console.error('Error importing records:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add single record
app.post('/api/campaigns/:id/records', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, phone, name, email } = req.body;
    console.log('Adding lead record:', { id, userId, phone, name, email });
    if (!userId || !phone) {
      return res.status(400).json({ success: false, message: 'User ID and phone number are required' });
    }

    const result = await campaignService.addContacts(id, [{
      phone_number: phone,
      name: name || null,
      email: email || null
    }]);
    res.json(result);
  } catch (error) {
    console.error('Error adding record:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add phone numbers to a campaign
app.post('/api/campaigns/:id/phone-numbers', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, phoneNumbers } = req.body;
    if (!userId || !phoneNumbers) {
      return res.status(400).json({ success: false, message: 'User ID and phone numbers are required' });
    }

    await campaignService.addPhoneNumbersToCampaign(id, userId, phoneNumbers);
    res.json({ success: true, message: 'Phone numbers added to campaign successfully' });
  } catch (error) {
    console.error('Error adding phone numbers to campaign:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete a record from a campaign
app.delete('/api/campaigns/:campaignId/records/:recordId', async (req, res) => {
  try {
    const { campaignId, recordId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const result = await campaignService.deleteRecord(recordId, campaignId, userId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Record not found or already deleted' });
    }

    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Google Sheets endpoint removed

// Get available voices from ElevenLabs
app.get('/api/voices/elevenlabs', async (req, res) => {
  try {
    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'ElevenLabs API key not configured' });
    }

    const response = await nodeFetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }

    const data = await response.json();
    const voices = data.voices.map(v => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      preview_url: v.preview_url
    }));

    res.json({ success: true, voices });
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ADD THIS NEW ENDPOINT - Add it after the existing /api/voices/elevenlabs endpoint

app.get('/api/voices/elevenlabs/list', async (req, res) => {
  try {
    // Get ElevenLabs API key from environment variables
    const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVEN_LABS_API_KEY;

    if (!apiKey) {
      console.error('âŒ ElevenLabs API key not configured on server');
      return res.status(500).json({
        success: false,
        message: 'ElevenLabs API key not configured on server. Please add ELEVEN_LABS_API_KEY to environment variables.'
      });
    }

    console.log(' Fetching voices from ElevenLabs API with key:', apiKey.substring(0, 4) + '...');

    // Fetch voices from ElevenLabs API
    const response = await nodeFetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey
      }
    });

    console.log('ElevenLabs API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('âŒ ElevenLabs API error:', response.status, errorText);

      // Check if the response is HTML (error page)
      if (errorText.startsWith('<!DOCTYPE') || errorText.includes('<html')) {
        return res.status(500).json({
          success: false,
          message: 'ElevenLabs API returned an HTML error page. Check API key and network connectivity.'
        });
      }

      return res.status(response.status).json({
        success: false,
        message: `ElevenLabs API error: ${response.statusText} - ${errorText}`
      });
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const errorText = await response.text();
      console.error('âŒ ElevenLabs API returned non-JSON response:', errorText.substring(0, 200));
      return res.status(500).json({
        success: false,
        message: 'ElevenLabs API returned invalid response format. Expected JSON.'
      });
    }

    const data = await response.json();

    console.log(` Successfully fetched ${data.voices?.length || 0} voices from ElevenLabs`);

    // Return voices with the voice_id as the id field (not mapped)
    res.json({
      success: true,
      voices: data.voices.map(voice => ({
        voice_id: voice.voice_id,  // Keep the actual ElevenLabs voice ID
        name: voice.name,
        category: voice.category || 'uncategorized',
        preview_url: voice.preview_url,
        labels: voice.labels || {}
      }))
    });
  } catch (error) {
    console.error('âŒ Error fetching ElevenLabs voices:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching ElevenLabs voices: ${error.message}`
    });
  }
});
// Voice preview endpoint
app.post('/api/voices/elevenlabs/preview', async (req, res) => {
  try {
    const { text, voiceId } = req.body;
    if (!text || !voiceId) {
      return res.status(400).json({ success: false, message: 'Text and voiceId are required' });
    }

    // For now, return a mock audio response (silent audio in base64)
    // In a real implementation, you would call ElevenLabs API here
    // This is a valid 1-second silent WAV audio file encoded in base64
    const silentAudioBase64 = 'UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==';

    res.json({
      success: true,
      audioData: silentAudioBase64,
      message: 'Voice preview generated successfully'
    });
  } catch (error) {
    console.error('Error generating voice preview:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

if (process.env.SARVAM_API_KEY && process.env.GEMINI_API_KEY) {
  console.log('[INIT] ✅ Initializing MediaStreamHandler with SARVAM_API_KEY and GEMINI_API_KEY');
  mediaStreamHandler = new MediaStreamHandler(
    process.env.GEMINI_API_KEY,
    process.env.OPENAI_API_KEY,
    campaignService,
    mysqlPool,
    process.env.SARVAM_API_KEY
  );
  console.log(" MediaStreamHandler initialized with Sarvam STT + Gemini + OpenAI + Cost Tracking");
} else {
  console.warn("[INIT] ❌ MediaStreamHandler NOT initialized - missing required API keys");
  console.warn(`[INIT] SARVAM_API_KEY: ${process.env.SARVAM_API_KEY ? 'present' : 'MISSING'}`);
  console.warn(`[INIT] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'present' : 'MISSING'}`);
}
// WebSocket endpoint for ElevenLabs STT
app.ws('/api/stt', function (ws, req) {
  elevenLabsStreamHandler.handleConnection(ws, req);
})
app.ws('/api/call', function (ws, req) {
  attachTwilioMediaStreamConnection(ws, req, 'express-ws:/api/call');
});
app.ws('/api/call/.websocket', function (ws, req) {
  attachTwilioMediaStreamConnection(ws, req, 'express-ws:/api/call/.websocket');
});
app.get('/api/call', (req, res) => {
  res.status(426).json({
    success: false,
    message: 'This endpoint requires a WebSocket upgrade.'
  });
});
// WebSocket endpoint for voice stream (frontend voice chat + Twilio calls)
app.ws('/voice-stream', async function (ws, req) {  //  ADDED async
  console.log('New voice stream connection established');
  let audioChunksReceived = 0;
  const audioBuffer = [];
  let isProcessing = false; // Flag to prevent overlapping responses
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;

  // Determine if this is a Twilio call or frontend chat
  const callId = req.query?.callId;
  const agentId = req.query?.agentId;
  const voiceId = req.query?.voiceId;
  const identity = req.query?.identity ? decodeURIComponent(req.query.identity) : null;
  const userId = req.query?.userId; //  ADDED - Get userId from query params
  const isTwilioCall = !!(callId && agentId);
  const isFrontendChat = !!(voiceId && !callId);

  console.log('Connection type:', isTwilioCall ? 'Twilio Call' : isFrontendChat ? 'Frontend Chat' : 'Unknown');
  console.log('Query params:', { voiceId, agentId, callId, userId, identity: identity ? 'present' : 'missing' });
  console.log('Call ID:', callId);
  console.log('Agent ID:', agentId);
  console.log('User ID:', userId);

  // Map voice names to ElevenLabs voice IDs

  let agentVoiceId = voiceId || '21m00Tcm4TlvDq8ikWAM'; // Default to Rachel if not provided
  // For frontend chat, use identity from query params if provided
  let agentIdentity = identity || 'You are a helpful AI assistant.';
  let agentName = 'AI Assistant';
  console.log('Voice identifier:', voiceIdentifier);
  console.log('Using ElevenLabs voice ID:', agentVoiceId);

  // For Twilio calls, fetch agent voice and identity from database if agentId is provided
  // For Twilio calls, fetch agent voice and identity from database if agentId is provided
  if (agentId) {
    agentService.getAgentById('system', agentId).then(agent => {
      if (agent) {
        // Get voice ID - use it directly, no mapping needed
        if (agent.voiceId) {
          agentVoiceId = agent.voiceId; // Use the voice ID directly from database
          console.log('Fetched agent voice ID from database:', agentVoiceId);
        }
        // Get agent identity/prompt from database (override if not provided in query)
        if (agent.identity && !identity) {
          agentIdentity = agent.identity;
          console.log('Fetched agent identity from database');
        }
        // Get agent name
        if (agent.name) {
          agentName = agent.name;
          console.log('Fetched agent name:', agentName);
        }
      }
    }).catch(error => {
      console.error('Error fetching agent:', error);
    });
  }

  if (!deepgramApiKey) {
    console.warn('WARNING: DEEPGRAM_API_KEY is not configured. Speech-to-text will not work.');
  }
  if (!geminiApiKey) {
    console.warn('WARNING: GEMINI_API_KEY is not configured. AI responses will not work.');
  }
  if (!elevenLabsApiKey) {
    console.warn('WARNING: ELEVEN_LABS_API_KEY is not configured. Text-to-speech will not work.');
  }

  // Handle incoming audio and text from the client
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.event === 'audio') {
        // Client is sending audio data
        audioChunksReceived++;
        audioBuffer.push(data.data);
        console.log('Received audio chunk', audioChunksReceived, 'from client (size:', data.data.length, ')');

        // Process every 10 chunks to batch transcription requests
        // But skip if already processing to prevent overlapping responses
        if (audioChunksReceived % 10 === 0 && deepgramApiKey && !isProcessing) {
          isProcessing = true; // Set flag before starting processing
          try {
            // Step 1: Send audio to Deepgram for transcription
            // Decode base64 audio chunks and combine them
            const audioBuffers = audioBuffer.map(chunk => Buffer.from(chunk, 'base64'));
            const combinedAudioBuffer = Buffer.concat(audioBuffers);

            console.log('Sending', combinedAudioBuffer.length, 'bytes of audio to Deepgram');

            const deepgramResponse = await nodeFetch('https://api.deepgram.com/v1/listen?model=nova-2&language=en&encoding=linear16&sample_rate=16000', {
              method: 'POST',
              headers: {
                'Authorization': `Token ${deepgramApiKey}`,
                'Content-Type': 'application/octet-stream'
              },
              body: combinedAudioBuffer
            });

            if (deepgramResponse.ok) {
              const deepgramResult = await deepgramResponse.json();
              const transcript = deepgramResult.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
              const confidence = deepgramResult.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

              //  Track Deepgram usage
              if (userId && callId) {
                const audioDurationSeconds = combinedAudioBuffer.length / (16000 * 2);
                try {
                  await walletService.recordUsageAndCharge(
                    userId,
                    callId,
                    'deepgram',
                    audioDurationSeconds,
                    { transcript_length: transcript.length }
                  );
                } catch (error) {
                  console.error('Error tracking Deepgram usage:', error);
                }
              }

              if (transcript) {
                console.log('Deepgram transcript:', transcript);

                // Step 2: Send transcript to Gemini for processing
                if (geminiApiKey) {
                  try {
                    // Use gemini-2.5-flash for best performance
                    // Build prompt with agent identity and user message
                    const systemPrompt = agentIdentity;
                    const userMessage = transcript;
                    const fullPrompt = systemPrompt + '\n\nUser: ' + userMessage;

                    const geminiResponse = await nodeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiApiKey, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        contents: [{
                          parts: [{
                            text: fullPrompt
                          }]
                        }]
                      })
                    });

                    if (geminiResponse.ok) {
                      const geminiResult = await geminiResponse.json();
                      const agentResponse = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate a response.';
                      console.log('Gemini response:', agentResponse);

                      //  Track Gemini usage
                      if (userId && callId) {
                        const estimatedTokens = (fullPrompt.length + agentResponse.length) / 4;
                        try {
                          await walletService.recordUsageAndCharge(
                            userId,
                            callId,
                            'gemini',
                            estimatedTokens,
                            { prompt_length: fullPrompt.length, response_length: agentResponse.length }
                          );
                        } catch (error) {
                          console.error('Error tracking Gemini usage:', error);
                        }
                      }

                      // Step 3: Send Gemini response to ElevenLabs for text-to-speech
                      if (elevenLabsApiKey) {
                        try {
                          // Use the agent's configured voice ID
                          console.log('Sending text to ElevenLabs with voice ID:', agentVoiceId);
                          const ttsResponse = await nodeFetch(`https://api.elevenlabs.io/v1/text-to-speech/${agentVoiceId}`, {
                            method: 'POST',
                            headers: {
                              'xi-api-key': elevenLabsApiKey,
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              text: agentResponse,
                              voice_settings: {
                                stability: 0.5,
                                similarity_boost: 0.75
                              }
                            })
                          });

                          if (ttsResponse.ok) {
                            const audioBuffer = await ttsResponse.arrayBuffer();
                            const audioBase64 = Buffer.from(audioBuffer).toString('base64');

                            //  Track ElevenLabs usage
                            if (userId && callId) {
                              const characterCount = agentResponse.length;
                              try {
                                await walletService.recordUsageAndCharge(
                                  userId,
                                  callId,
                                  'elevenlabs',
                                  characterCount,
                                  { text_length: characterCount, voice_id: agentVoiceId }
                                );
                              } catch (error) {
                                console.error('Error tracking ElevenLabs usage:', error);
                              }
                            }

                            // Send audio back to client
                            ws.send(JSON.stringify({
                              event: 'audio',
                              audio: audioBase64
                            }));

                            // Also send the transcript for display
                            ws.send(JSON.stringify({
                              event: 'transcript',
                              text: transcript,
                              confidence: confidence
                            }));

                            // Send agent response for display
                            ws.send(JSON.stringify({
                              event: 'agent-response',
                              text: agentResponse
                            }));

                          } else {
                            const errorText = await ttsResponse.text();
                            console.error('ElevenLabs TTS error:', ttsResponse.status, errorText);
                            // Check if the response is HTML (error page)
                            if (errorText.startsWith('<!DOCTYPE') || errorText.includes('<html')) {
                              console.error('ElevenLabs API returned HTML error page. Check API key and network connectivity.');
                              ws.send(JSON.stringify({
                                event: 'error',
                                message: 'ElevenLabs API configuration error. Please check API key.'
                              }));
                            } else {
                              // Parse JSON error if possible
                              try {
                                const errorJson = JSON.parse(errorText);
                                ws.send(JSON.stringify({
                                  event: 'error',
                                  message: `TTS Error: ${errorJson.detail?.message || errorJson.message || 'Failed to generate audio response'}`
                                }));
                              } catch (parseError) {
                                // If not JSON, send the raw error
                                ws.send(JSON.stringify({
                                  event: 'error',
                                  message: `TTS Error: ${errorText.substring(0, 200)}`
                                }));
                              }
                            }
                          }
                          // Clear processing flag after TTS processing (whether successful or not)
                          isProcessing = false;
                        } catch (ttsError) {
                          console.error('Error calling ElevenLabs TTS:', ttsError);
                          ws.send(JSON.stringify({
                            event: 'error',
                            message: 'Error converting response to speech'
                          }));
                          isProcessing = false;
                        }
                      } else {
                        // Send just the text response if TTS is not configured
                        ws.send(JSON.stringify({
                          event: 'agent-response',
                          text: agentResponse
                        }));
                        isProcessing = false;
                      }
                    } else {
                      const errorText = await geminiResponse.text();
                      console.error('Gemini API error:', geminiResponse.status, errorText);
                      ws.send(JSON.stringify({
                        event: 'error',
                        message: 'Gemini failed to process transcript'
                      }));
                      isProcessing = false;
                    }
                  } catch (geminiError) {
                    console.error('Error calling Gemini:', geminiError);
                    ws.send(JSON.stringify({
                      event: 'error',
                      message: 'Error processing with Gemini'
                    }));
                    isProcessing = false;
                  }
                } else {
                  // Send transcript if Gemini is not configured
                  ws.send(JSON.stringify({
                    event: 'transcript',
                    text: transcript,
                    confidence: confidence
                  }));
                  isProcessing = false;
                }

                // Clear buffer after successful transcription
                audioBuffer.length = 0;
              } else {
                isProcessing = false;
              }
            } else {
              const errorText = await deepgramResponse.text();
              console.error('Deepgram API error:', deepgramResponse.status, errorText);
              ws.send(JSON.stringify({
                event: 'error',
                message: `Deepgram error: ${deepgramResponse.status} - ${errorText.substring(0, 200)}`
              }));
              isProcessing = false;
            }
          } catch (transcriptionError) {
            console.error('Error in voice processing pipeline:', transcriptionError);
            ws.send(JSON.stringify({
              event: 'error',
              message: `Voice processing error: ${transcriptionError.message}`
            }));
            isProcessing = false;
          }
        } else if (audioChunksReceived % 10 === 0 && isProcessing) {
          console.log('Skipping audio processing - already processing previous response');
        }
      } else if (data.event === 'ping') {
        // Respond to client ping
        ws.send(JSON.stringify({ event: 'pong' }));
      }
    } catch (error) {
      console.error('Error processing voice stream message:', error);
    }
  });

  // Send a greeting message after connection
  setTimeout(() => {
    try {
      ws.send(JSON.stringify({
        event: 'message',
        text: 'Hello! I\'m ready to process your voice. I\'ll use Deepgram for speech-to-text, Gemini for AI responses, and ElevenLabs for text-to-speech.'
      }));
    } catch (error) {
      console.error('Error sending greeting:', error);
    }
  }, 500);

  ws.on('close', () => {
    console.log('Voice stream connection closed. Total audio chunks received:', audioChunksReceived);
    audioBuffer.length = 0;
  });

  ws.on('error', (error) => {
    console.error('Voice stream WebSocket error:', error);
  });
});

// Twilio number management endpoints
// Add a Twilio number for a user
app.post('/api/add-twilio-number', async (req, res) => {
  try {
    const { userId, phoneNumber, region, accountSid, authToken } = req.body;
    if (!userId || !phoneNumber || !region || !accountSid || !authToken) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const result = await twilioService.addTwilioNumber(userId, phoneNumber, region, accountSid, authToken);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error adding Twilio number:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Verify Twilio number with OTP
app.post('/api/verify-twilio-otp', async (req, res) => {
  try {
    const { userId, phoneNumber, otp } = req.body;
    if (!userId || !phoneNumber || !otp) {
      return res.status(400).json({ success: false, message: 'User ID, phone number, and OTP are required' });
    }

    const verified = await twilioService.verifyTwilioNumber(userId, phoneNumber, otp);
    res.json({ success: true, verified });
  } catch (error) {
    console.error('Error verifying Twilio number:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all Twilio numbers for a user
app.get('/api/twilio-numbers/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const numbers = await twilioService.getVerifiedNumbers(userId);
    res.json({ success: true, data: numbers });
  } catch (error) {
    console.error('Error fetching Twilio numbers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// Set caller phone and agent for campaign
app.post('/api/campaigns/:id/set-caller-phone', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, callerPhone, agentId } = req.body;

    if (!userId || !callerPhone) {
      return res.status(400).json({ success: false, message: 'User ID and caller phone are required' });
    }

    // Validate that caller phone is a verified Twilio number
    const verifiedNumbers = await twilioService.getVerifiedNumbers(userId);
    const twilioNumber = verifiedNumbers.find(num => num.id === callerPhone || num.phoneNumber === callerPhone);

    if (!twilioNumber) {
      return res.status(400).json({
        success: false,
        message: 'Caller phone must be a verified Twilio number'
      });
    }

    // Update campaign with caller phone and agent
    await mysqlPool.execute(
      'UPDATE campaigns SET caller_phone = ?, agent_id = ? WHERE id = ? AND user_id = ?',
      [twilioNumber.phoneNumber, agentId || null, id, userId]
    );

    const updatedCampaign = await campaignService.getCampaign(id, userId);
    res.json({ success: true, data: updatedCampaign });

  } catch (error) {
    console.error('Error setting caller phone:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Import CSV records
app.post('/api/campaigns/:id/import', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, csvData } = req.body;

    if (!userId || !csvData || !Array.isArray(csvData)) {
      return res.status(400).json({
        success: false,
        message: 'User ID and CSV data are required'
      });
    }

    const count = await campaignService.importRecords(id, userId, csvData);

    res.json({
      success: true,
      message: `Successfully imported ${count} records`
    });

  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add single record
app.post('/api/campaigns/:id/records', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, phone } = req.body;

    if (!userId || !phone) {
      return res.status(400).json({
        success: false,
        message: 'User ID and phone number are required'
      });
    }

    const record = await campaignService.addRecord(id, userId, phone);

    res.json({ success: true, data: record });

  } catch (error) {
    console.error('Error adding record:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete record
app.delete('/api/campaigns/:campaignId/records/:recordId', async (req, res) => {
  try {
    const { campaignId, recordId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    await campaignService.deleteRecord(recordId, campaignId, userId);

    res.json({ success: true, message: 'Record deleted successfully' });

  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Set Google Sheets URL for campaign
app.post('/api/campaigns/:id/set-google-sheet', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, googleSheetUrl } = req.body;

    if (!userId || !googleSheetUrl) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Google Sheet URL are required'
      });
    }

    await mysqlPool.execute(
      'UPDATE campaigns SET google_sheet_url = ? WHERE id = ? AND user_id = ?',
      [googleSheetUrl, id, userId]
    );

    const updatedCampaign = await campaignService.getCampaign(id, userId);
    res.json({ success: true, data: updatedCampaign });

  } catch (error) {
    console.error('Error setting Google Sheet URL:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start campaign - make calls to all pending records
app.post('/api/campaigns/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Get campaign details
    const campaign = await campaignService.getCampaign(id);

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    // Verify campaign belongs to user
    if (campaign.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Match V1 start validation so we only report success when dialing can actually begin
    if (!campaign.phone_number_id) {
      return res.status(400).json({
        success: false,
        message: 'Please set a caller phone number before starting the campaign'
      });
    }

    if (!campaign.agent_id) {
      return res.status(400).json({
        success: false,
        message: 'Please select an agent for this campaign'
      });
    }

    // Get all pending or retryable contacts
    const [contacts] = await mysqlPool.execute(
      'SELECT id FROM campaign_contacts WHERE campaign_id = ? AND status IN (?, ?)',
      [id, 'pending', 'failed']
    );

    if (contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending or retryable contacts found. Please add contacts to the campaign.'
      });
    }

    // Update campaign status to running
    await campaignService.startCampaign(id, userId);

    // Start processing campaign in background
    campaignService.processCampaign(id, userId).catch(err => {
      console.error('Error processing campaign:', err);
    });

    res.json({
      success: true,
      data: await campaignService.getCampaign(id),
      message: `Campaign started. Calling ${contacts.length} contacts...`
    });

  } catch (error) {
    console.error('Error starting campaign:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stop campaign
app.post('/api/campaigns/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    const updatedCampaign = await campaignService.stopCampaign(id, userId);

    res.json({ success: true, data: updatedCampaign });
  }
  catch (error) {
    console.error('Error stopping campaign:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update concurrent calls limit for campaign
app.put('/api/campaigns/:id/concurrent-calls', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, concurrentCalls } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    if (!concurrentCalls || concurrentCalls < 1 || concurrentCalls > 10) {
      return res.status(400).json({
        success: false,
        message: 'Concurrent calls must be between 1 and 10'
      });
    }

    // Update campaign concurrent calls
    await mysqlPool.execute(
      'UPDATE campaigns SET concurrent_calls = ? WHERE id = ? AND user_id = ?',
      [concurrentCalls, id, userId]
    );

    const updatedCampaign = await campaignService.getCampaign(id);
    res.json({ success: true, data: updatedCampaign });
  }
  catch (error) {
    console.error('Error updating concurrent calls:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// Process campaign calls (runs in background)
async function processCampaignCalls(campaignId, userId, campaign, records) {
  console.log(`Processing campaign ${campaignId} with ${records.length} records`);

  // Get verified Twilio numbers
  const verifiedNumbers = await twilioService.getVerifiedNumbers(userId);
  const twilioNumber = verifiedNumbers.find(num => num.phoneNumber === campaign.callerPhone);

  if (!twilioNumber) {
    console.error('Twilio number not found:', campaign.callerPhone);
    return;
  }
  // Process records sequentially with delay
  for (const record of records) {
    try {
      // Check if campaign is still running
      const currentCampaign = await campaignService.getCampaign(campaignId, userId);
      if (currentCampaign.status !== 'running') {
        console.log('Campaign stopped, exiting...');
        break;
      }
      // Update record status to in-progress
      await campaignService.updateRecordStatus(record.id, 'in-progress');
      // Make the call
      const callId = uuidv4();
      const appUrl = getBackendUrl();
      const cleanAppUrl = normalizeBackendUrl(appUrl);

      const call = await twilioService.createCall({
        userId: userId,
        twilioNumberId: twilioNumber.id,
        to: record.phone,
        agentId: campaign.agentId,
        callId: callId,
        appUrl: cleanAppUrl
      });
      //  Log all incoming HTTP requests to spot patterns
      app.use((req, res, next) => {
        const isWebSocket = req.headers.upgrade === 'websocket';
        if (isWebSocket || req.url.includes('/api/call') || req.url.includes('/api/twilio')) {
          console.log(` ${req.method} ${req.url}`, {
            headers: {
              upgrade: req.headers.upgrade,
              connection: req.headers.connection,
              'user-agent': req.headers['user-agent']?.substring(0, 50)
            }
          });
        }
        next();
      });
      // Update record with call SID
      await campaignService.updateRecordCallSid(record.id, call.sid);

      console.log(`Call initiated for ${record.phone}: ${call.sid}`);

      // Wait 30 seconds before next call (to avoid rate limits)
      await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
      console.error(`Error calling ${record.phone}:`, error);
      await campaignService.updateRecordStatus(record.id, 'failed');
      await campaignService.incrementRecordRetry(record.id);
    }
  }

  console.log(`Campaign ${campaignId} processing complete`);
}

// Schema Migration Endpoint
app.get('/api/admin/migrate-schema', async (req, res) => {
  try {
    const checkColumn = async (table, column) => {
      const [rows] = await mysqlPool.execute(
        `SHOW COLUMNS FROM ${table} LIKE '${column}'`
      );
      return rows.length > 0;
    };

    const [tables] = await mysqlPool.execute("SHOW TABLES LIKE 'campaigns'");
    if (tables.length === 0) return res.status(404).json({ message: 'campaigns table not found' });

    const alterQueries = [];

    //  campaigns table 
    if (!(await checkColumn('campaigns', 'agent_id')))
      alterQueries.push("ALTER TABLE campaigns ADD COLUMN agent_id VARCHAR(50) NULL");
    if (!(await checkColumn('campaigns', 'phone_number_id')))
      alterQueries.push("ALTER TABLE campaigns ADD COLUMN phone_number_id VARCHAR(50) NULL");
    if (!(await checkColumn('campaigns', 'concurrent_calls')))
      alterQueries.push("ALTER TABLE campaigns ADD COLUMN concurrent_calls INT DEFAULT 1");
    if (!(await checkColumn('campaigns', 'retry_attempts')))
      alterQueries.push("ALTER TABLE campaigns ADD COLUMN retry_attempts INT DEFAULT 0");

    //  campaign_contacts table 
    const [ccTables] = await mysqlPool.execute("SHOW TABLES LIKE 'campaign_contacts'");
    if (ccTables.length > 0) {
      if (!(await checkColumn('campaign_contacts', 'email')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN email VARCHAR(255) NULL AFTER name");
      if (!(await checkColumn('campaign_contacts', 'intent')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN intent VARCHAR(100) NULL AFTER status");
      if (!(await checkColumn('campaign_contacts', 'schedule_time')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN schedule_time DATETIME NULL AFTER intent");
      if (!(await checkColumn('campaign_contacts', 'transcript')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN transcript TEXT NULL AFTER schedule_time");
      if (!(await checkColumn('campaign_contacts', 'meet_link')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN meet_link VARCHAR(255) NULL AFTER transcript");
      if (!(await checkColumn('campaign_contacts', 'call_duration')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN call_duration INT DEFAULT 0 AFTER transcript");
      if (!(await checkColumn('campaign_contacts', 'call_cost')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN call_cost DECIMAL(10,4) DEFAULT 0 AFTER call_duration");
      if (!(await checkColumn('campaign_contacts', 'call_id')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN call_id VARCHAR(100) NULL AFTER call_cost");
      if (!(await checkColumn('campaign_contacts', 'error_message')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN error_message TEXT NULL");
      if (!(await checkColumn('campaign_contacts', 'last_attempt_at')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN last_attempt_at DATETIME NULL");
      if (!(await checkColumn('campaign_contacts', 'completed_at')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN completed_at DATETIME NULL");
      if (!(await checkColumn('campaign_contacts', 'email_sent_at')))
        alterQueries.push("ALTER TABLE campaign_contacts ADD COLUMN email_sent_at DATETIME NULL AFTER meet_link");
    }

    //  users table 
    const [userTables] = await mysqlPool.execute("SHOW TABLES LIKE 'users'");
    if (userTables.length > 0) {
      if (!(await checkColumn('users', 'status')))
        alterQueries.push("ALTER TABLE users ADD COLUMN status ENUM('active', 'inactive', 'locked') DEFAULT 'active' AFTER role");
    }

    const results = [];
    for (const query of alterQueries) {
      try {
        await mysqlPool.execute(query);
        results.push(` Executed: ${query}`);
      } catch (alterErr) {
        results.push(`âŒ Failed: ${query}” ${alterErr.message}`);
      }
    }

    res.json({
      success: true,
      changes: results,
      message: results.length ? `Applied ${results.length} schema changes` : 'Schema already up to date'
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Import CSV Endpoint
app.post('/api/campaigns/:id/import-csv', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, csvContent } = req.body;
    // require csvParser here to ensure it uses the latest version
    const csvParser = require('./csvParser');

    const records = csvParser.parseCSV(csvContent);
    let successCount = 0;

    // Insert into DB
    for (const record of records) {
      if (!record.phone_number) continue;

      try {
        await mysqlPool.execute(
          `INSERT INTO campaign_contacts 
           (id, campaign_id, phone_number, name, email, status, created_at, updated_at) 
           VALUES (UUID(), ?, ?, ?, ?, 'pending', NOW(), NOW())`,
          [id, record.phone_number, record.name || '', record.email || '']
        );
        successCount++;
      } catch (err) {
        console.error('Insert error for record:', record, err);
      }
    }

    res.json({ success: true, count: successCount });
  } catch (error) {
    console.error('Import CSV error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Campaign Endpoint (for Agent Assignment, Phone Number, etc.)
app.put('/api/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, agent_id, phone_number_id, name, description, concurrent_calls, max_retry_attempts } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Verify campaign belongs to user first
    const [existing] = await mysqlPool.execute(
      'SELECT id FROM campaigns WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    // Build dynamic UPDATE” only set columns that were provided
    const updates = [];
    const values = [];

    if (agent_id !== undefined) { updates.push('agent_id = ?'); values.push(agent_id || null); }
    if (phone_number_id !== undefined) { updates.push('phone_number_id = ?'); values.push(phone_number_id || null); }
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (concurrent_calls !== undefined) { updates.push('concurrent_calls = ?'); values.push(concurrent_calls); }
    if (max_retry_attempts !== undefined) { updates.push('max_retry_attempts = ?'); values.push(max_retry_attempts); }

    if (updates.length === 0) {
      return res.json({ success: true, message: 'No fields to update' });
    }

    values.push(id, userId);
    await mysqlPool.execute(
      `UPDATE campaigns SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ? AND user_id = ?`,
      values
    );

    // Return updated campaign
    const [updated] = await mysqlPool.execute(
      'SELECT * FROM campaigns WHERE id = ?',
      [id]
    );

    res.json({ success: true, data: updated[0] });
  } catch (error) {
    console.error('Update Campaign error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// fetch Scheduled calls
app.get('/api/scheduled-calls', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

    const [user] = await mysqlPool.execute('SELECT current_company_id FROM users WHERE id = ?', [userId]);
    const companyId = user.length > 0 ? user[0].current_company_id : null;

    let query = `
      SELECT cc.*, c.name as campaignName, a.name as agentName, a.id as agentId
      FROM campaign_contacts cc
      JOIN campaigns c ON cc.campaign_id = c.id
      LEFT JOIN agents a ON c.agent_id = a.id
      WHERE c.user_id = ? AND cc.schedule_time IS NOT NULL AND cc.intent IN ('needs_demo', 'scheduled_meeting', '1_on_1_session_requested')
    `;
    const params = [userId];

    if (companyId) {
      query += ' AND c.company_id = ?';
      params.push(companyId);
    } else {
      query += ' AND (c.company_id IS NULL OR c.company_id = "")';
    }

    query += ' ORDER BY cc.schedule_time ASC';

    const [rows] = await mysqlPool.execute(query, params);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching scheduled calls:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Scheduled call
app.delete('/api/scheduled-calls/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await mysqlPool.execute('DELETE FROM campaign_contacts WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Scheduled call not found' });
    }

    res.json({ success: true, message: 'Scheduled call deleted successfully' });
  } catch (error) {
    console.error('Error deleting scheduled call:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reschedule Call
app.post('/api/scheduled-calls/reschedule', async (req, res) => {
  try {
    const { contactId, newTime } = req.body;
    if (!contactId || !newTime) return res.status(400).json({ success: false, message: 'Contact ID and new time required' });

    const [rows] = await mysqlPool.execute(`
      SELECT cc.email, cc.name, cc.campaign_id, c.user_id 
      FROM campaign_contacts cc
      JOIN campaigns c ON cc.campaign_id = c.id
      WHERE cc.id = ?
    `, [contactId]);

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Lead not found' });
    const contactInfo = rows[0];

    // Attempt to generate meet link and send email if email exists
    let newMeetLink = null;
    if (contactInfo.email) {
      try {
        const emailService = require('./services/emailService.js');
        const [campRows] = await mysqlPool.execute(
          'SELECT a.name as agent_name FROM campaigns c JOIN agents a ON c.agent_id = a.id WHERE c.id = ?',
          [contactInfo.campaign_id]
        );
        const agentName = campRows.length > 0 ? campRows[0].agent_name : 'Ziya Voice Agent';

        newMeetLink = emailService.generateMeetLink();
        await emailService.sendMeetingInvite(
          contactInfo.email,
          contactInfo.name,
          agentName,
          newTime,
          newMeetLink
        );
      } catch (err) {
        console.error('Error sending reschedule email:', err);
      }
    }

    // Update DB
    const updateQuery = `
      UPDATE campaign_contacts
      SET schedule_time = ?, meet_link = ?, status = 'Rescheduled'
      WHERE id = ?
    `;
    await mysqlPool.execute(updateQuery, [newTime, newMeetLink || null, contactId]);

    res.json({ success: true, message: 'Meeting rescheduled successfully', meetLink: newMeetLink });
  } catch (error) {
    console.error('Error rescheduling call:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get User Phone Numbers (from user_twilio_numbers)” for campaign dropdown
app.get('/api/phone-numbers', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

    // Columns that actually exist in user_twilio_numbers:
    // id, user_id, phone_number, region, provider, verified,
    // verification_code, verification_expires_at, twilio_account_sid, twilio_auth_token, created_at
    const [rows] = await mysqlPool.execute(
      `SELECT id, phone_number, region, verified,
      (twilio_account_sid IS NOT NULL) AS has_credentials
       FROM user_twilio_numbers
       WHERE user_id = ?
  ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ success: true, phoneNumbers: rows });
  } catch (error) {
    console.error('Error fetching phone numbers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get User Agents (for campaign creation)
app.get('/api/agents', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

    const [agents] = await mysqlPool.execute(
      'SELECT id, name, status FROM agents WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json({ success: true, agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Export Campaign Leads to CSV
app.get('/api/campaigns/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

    // Verify ownership
    const [campaigns] = await mysqlPool.execute('SELECT name FROM campaigns WHERE id = ? AND user_id = ?', [id, userId]);
    if (campaigns.length === 0) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const campaignName = campaigns[0].name;

    // Get contacts
    const [contacts] = await mysqlPool.execute(
      'SELECT name, phone_number, email, status, attempts, created_at, call_duration, call_cost FROM campaign_contacts WHERE campaign_id = ? ORDER BY created_at ASC',
      [id]
    );

    // Convert to CSV
    const headers = ['Name', 'Phone', 'Email', 'Status', 'Attempts', 'Call Duration (s)', 'Cost ($)', 'Date Added'];
    const csvRows = [headers.join(',')];

    contacts.forEach(c => {
      const row = [
        c.name ? `"${c.name.replace(/"/g, '""')}"` : '',
        `"${c.phone_number}"`,
        c.email ? `"${c.email}"` : '',
        c.status || 'pending',
        c.attempts || 0,
        c.call_duration || 0,
        c.call_cost || 0,
        c.created_at ? new Date(c.created_at).toLocaleDateString() : ''
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${campaignName.replace(/[^a-z0-9]/gi, '_')}_leads.csv"`);
    res.send(csvString);

  } catch (error) {
    console.error('Error exporting campaign:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Failed Campaign Notifications
app.get('/api/notifications/failures', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }

    // A campaign is considered "failed" if it hit an error. Usually this manifests either as status='error' or 'failed' on the campaign itself,
    // OR it has contacts with status='failed'.
    const query = `
      SELECT 
        c.id as campaign_id, 
        c.name as campaign_name, 
        COUNT(cc.id) as failed_calls, 
        MAX(cc.error_message) as last_error, 
        MAX(cc.updated_at) as last_failed_at
      FROM campaigns c
      JOIN campaign_contacts cc ON c.id = cc.campaign_id
      WHERE c.user_id = ? AND cc.status = 'failed'
      GROUP BY c.id, c.name
      ORDER BY last_failed_at DESC
      LIMIT 10
    `;
    const [failedContacts] = await mysqlPool.execute(query, [userId]);

    // Also get campaigns where the campaign itself failed (just in case)
    const [failedCampaigns] = await mysqlPool.execute(
      `SELECT id as campaign_id, name as campaign_name, updated_at as last_failed_at, 'Campaign stopped unexpectedly' as last_error 
       FROM campaigns WHERE user_id = ? AND status IN ('error', 'failed') ORDER BY updated_at DESC LIMIT 5`,
      [userId]
    );

    // Merge them and format into notifications
    const notificationsMap = new Map();

    failedCampaigns.forEach(c => {
      notificationsMap.set(c.campaign_id, {
        id: 'camp_' + c.campaign_id,
        title: `Campaign Failed: ${c.campaign_name}`,
        message: c.last_error || 'An unexpected error occurred.',
        timeRaw: c.last_failed_at,
        read: false
      });
    });

    failedContacts.forEach(f => {
      if (!notificationsMap.has(f.campaign_id)) {
        notificationsMap.set(f.campaign_id, {
          id: 'camp_calls_' + f.campaign_id,
          title: `Campaign Calls Failed: ${f.campaign_name}`,
          message: `${f.failed_calls} call(s) failed. Error: ${f.last_error || 'Unknown error'}`,
          timeRaw: f.last_failed_at,
          read: false
        });
      }
    });

    let notifications = Array.from(notificationsMap.values());
    notifications.sort((a, b) => new Date(b.timeRaw).getTime() - new Date(a.timeRaw).getTime());

    // Format human readable time for frontend
    notifications = notifications.map(n => {
      const diff = Date.now() - new Date(n.timeRaw).getTime();
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(mins / 60);
      const days = Math.floor(hours / 24);
      let timeStr = 'Just now';
      if (days > 0) timeStr = `${days} day(s) ago`;
      else if (hours > 0) timeStr = `${hours} hour(s) ago`;
      else if (mins > 0) timeStr = `${mins} min(s) ago`;

      return {
        id: n.id,
        title: n.title,
        message: n.message,
        time: timeStr,
        timeRaw: n.timeRaw,
        read: n.read
      };
    });

    res.json({ success: true, notifications });
  } catch (error) {
    console.error('Error fetching failure notifications:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/db-conn-status", async (req, res) => {
  try {
    const conn = await mysqlPool.getConnection();
    await conn.ping();
    conn.release();

    res.json({ success: true, message: "MySQL connected successfully!" });
  } catch (error) {
    console.error("MYSQL CONNECTION ERROR:", error);
    res.json({ success: false, error: error.message || "No message" });
  }
});
// Log important HTTP requests
app.use((req, res, next) => {
  const isWebSocket = req.headers.upgrade === 'websocket';

  if (isWebSocket || req.url.includes('/api/call') || req.url.includes('/api/twilio')) {
    console.log(` ${req.method} ${req.url}`, {
      headers: {
        upgrade: req.headers.upgrade,
        connection: req.headers.connection,
        'user-agent': req.headers['user-agent']?.substring(0, 50)
      }
    });
  }
  next();
});

// ============ PRE-SERVER STARTUP VERIFICATION ============
console.log('\n🔍 === PRE-SERVER STARTUP VERIFICATION ===');

const preStartupChecks = {
  timestamp: new Date().toISOString(),
  checks: {
    sarvamApiKey: !!process.env.SARVAM_API_KEY,
    geminiApiKey: !!process.env.GEMINI_API_KEY,
    elevenLabsApiKey: !!process.env.ELEVEN_LABS_API_KEY,
    appUrl: !!config.APP_URL,
    mediaStreamHandlerInitialized: !!mediaStreamHandler,
    twilioCallWssCreated: !!twilioCallWss,
    portConfigured: !!PORT
  }
};

// Log each check
Object.entries(preStartupChecks.checks).forEach(([key, value]) => {
  const status = value ? '✅' : '❌';
  console.log(`${status} ${key}: ${value}`);
});

// Check if all critical services are ready
const allCriticalReady = 
  preStartupChecks.checks.sarvamApiKey &&
  preStartupChecks.checks.geminiApiKey &&
  preStartupChecks.checks.mediaStreamHandlerInitialized &&
  preStartupChecks.checks.twilioCallWssCreated;

if (!allCriticalReady) {
  console.warn('⚠️  WARNING: Some critical services are not ready. Voice calls may fail.');
  console.warn('   Missing:', 
    Object.entries(preStartupChecks.checks)
      .filter(([_, val]) => !val)
      .map(([key]) => key)
      .join(', ')
  );
} else {
  console.log('✅ All critical services are ready for voice calls');
}
console.log('🔍 === END VERIFICATION ===\n');

// ============ DIAGNOSTIC ENDPOINT ============
// This endpoint helps verify WebSocket connectivity and handler readiness
app.get('/api/websocket-test', (req, res) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    websocket: {
      twilioCallWssCreated: !!twilioCallWss,
      twilioCallWssConnections: twilioCallWss ? twilioCallWss.clients?.size || 0 : 0
    },
    handler: {
      mediaStreamHandlerInitialized: !!mediaStreamHandler,
      mediaStreamHandlerHasMethod: !!mediaStreamHandler?.handleConnection
    },
    apiKeys: {
      sarvam: !!process.env.SARVAM_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      elevenLabs: !!process.env.ELEVEN_LABS_API_KEY,
      deepgram: !!process.env.DEEPGRAM_API_KEY
    },
    server: {
      port: PORT,
      appUrl: config.APP_URL,
      nodeEnv: process.env.NODE_ENV || 'development',
      uptime: process.uptime()
    },
    websocketUpgradeHandlerRegistered: true,
    connectionListenerRegistered: true,
    status: (!!mediaStreamHandler && !!twilioCallWss) ? 'READY ✅' : 'NOT READY ❌'
  };

  res.json(diagnostics);
});

  // Start server and bind to 0.0.0.0 for Railway
  validateStartupDependencies().then(() => server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 === SERVER STARTED ===`);
    console.log(`Server listening on port ${PORT}`);
    console.log(`Frontend URL: ${FRONTEND_URL}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`WebSocket endpoint: /api/call`);
    console.log(`Diagnostic endpoint: /api/websocket-test`);
    console.log(`🚀 === SERVER READY ===\n`);
  })).catch((error) => {
    console.error('[STARTUP] Fatal startup validation failure:', error);
    process.exit(1);
  });

// Global error handler for webhook/route crashes
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled route exception:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

function getMissingCriticalStartupConfig() {
  const required = [
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'MYSQL_DATABASE',
    'SESSION_SECRET',
    'SARVAM_API_KEY',
    'GEMINI_API_KEY'
  ];

  return required.filter((key) => !process.env[key]);
}

async function validateDatabaseConnection() {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

async function validateStartupDependencies() {
  const missingConfig = getMissingCriticalStartupConfig();
  if (missingConfig.length > 0) {
    throw new Error(`Missing critical startup configuration: ${missingConfig.join(', ')}`);
  }

  await validateDatabaseConnection();

  if (!mediaStreamHandler) {
    throw new Error('MediaStreamHandler failed to initialize; refusing to accept traffic');
  }

  app.locals.startupChecks = {
    ready: true,
    checkedAt: new Date().toISOString()
  };
}

process.on('unhandledRejection', (error) => {
  console.error('[PROCESS] Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught exception:', error);
});

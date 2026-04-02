const path = require('path');
const fs = require('fs');

// Determine which environment we're running in
const DEFAULT_ENV = 'local';
const APP_ENV = process.env.APP_ENV || DEFAULT_ENV;

// Map environment names to .env file paths
const ENV_FILES = {
  local: '.env.local',
  stage: '.env.stage',
  production: '.env.production',
  development: '.env.local' // Alias for local
};

// Also support the default .env file
const envFileName = ENV_FILES[APP_ENV] || '.env.local';
const envPath = path.resolve(process.cwd(), envFileName);

// Load the appropriate .env file
console.log(`[CONFIG] Loading environment: ${APP_ENV} from ${envPath}`);

// Check if file exists
if (!fs.existsSync(envPath)) {
  console.warn(`[CONFIG] Warning: Environment file not found at ${envPath}`);
}

// Load environment variables from the specific file
require('dotenv').config({ path: envPath });

/**
 * Validates that all required environment variables are set
 */
function validateRequiredEnv() {
  const required = [
    'NODE_ENV',
    'PORT',
    'BACKEND_BASE_URL',
    'API_PATH',
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'MYSQL_DATABASE'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('[CONFIG] Error: Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    // Don't throw error in development, just warn
    if (APP_ENV === 'production') {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}

/**
 * Get environment variable with optional default value
 */
function getEnv(key, defaultValue = undefined) {
  const value = process.env[key];
  if (value === undefined && defaultValue !== undefined) {
    return defaultValue;
  }
  return value;
}

// Validate environment on load (production is strict)
if (APP_ENV === 'production') {
  validateRequiredEnv();
}

/**
 * Exported configuration object
 * Provides centralized access to all environment variables
 */
const config = {
  // Deployment Info
  APP_ENV,
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  
  // Server Configuration
  PORT: parseInt(getEnv('PORT', '5000'), 10),
  BACKEND_BASE_URL: getEnv('BACKEND_BASE_URL',),
  API_PATH: getEnv('API_PATH', '/api'),
  // Constructed URLs from base + path
  APP_URL: `${getEnv('BACKEND_BASE_URL')}${getEnv('API_PATH', '/api')}`,
  BASE_URL: `${getEnv('BACKEND_BASE_URL')}${getEnv('API_PATH', '/api')}`,
  FRONTEND_URL: getEnv('FRONTEND_URL'),
  
  // Database Configuration
  DATABASE: {
    host: getEnv('MYSQL_HOST'),
    port: parseInt(getEnv('MYSQL_PORT'), 10),
    user: getEnv('MYSQL_USER', 'root'),
    password: getEnv('MYSQL_PASSWORD', ''),
    database: getEnv('MYSQL_DATABASE')
  },

  // Session Security
  SESSION_SECRET: getEnv('SESSION_SECRET'),

  // API Keys - STT (Speech to Text)
  DEEPGRAM_API_KEY: getEnv('DEEPGRAM_API_KEY', ''),
  
  // Vite Frontend Configuration  
  VITE: {
    PORT: parseInt(getEnv('VITE_PORT'), 10),
    API_BASE_URL: getEnv('VITE_API_BASE_URL'),
    DEEPGRAM_API_KEY: getEnv('VITE_DEEPGRAM_API_KEY', ''),
    GEMINI_API_KEY: getEnv('VITE_GEMINI_API_KEY', ''),
    ELEVEN_LABS_API_KEY: getEnv('VITE_ELEVEN_LABS_API_KEY', '')
  },

  // Google OAuth Configuration
  GOOGLE: {
    CLIENT_ID: getEnv('GOOGLE_CLIENT_ID', ''),
    CLIENT_SECRET: getEnv('GOOGLE_CLIENT_SECRET', ''),
    // Use provided callback URL or construct from base + path + callback endpoint
    CALLBACK_URL: getEnv('GOOGLE_CALLBACK_URL') || `${getEnv('BACKEND_BASE_URL')}${getEnv('API_PATH', '/api')}/auth/google/callback`,
    SERVICE_ACCOUNT_EMAIL: getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', ''),
    PRIVATE_KEY: getEnv('GOOGLE_PRIVATE_KEY', '')
  },

  // TTS Configuration
  TTS_PROVIDER: getEnv('TTS_PROVIDER', 'elevenlabs'),
  ELEVEN_LABS_API_KEY: getEnv('ELEVEN_LABS_API_KEY', ''),
  
  // Additional API Keys
  GEMINI_API_KEY: getEnv('GEMINI_API_KEY', ''),
  SARVAM_API_KEY: getEnv('SARVAM_API_KEY', ''),

  // Utility Functions
  isLocal: () => APP_ENV === 'local' || APP_ENV === 'development',
  isStaging: () => APP_ENV === 'stage',
  isProduction: () => APP_ENV === 'production',
  isDevelopment: () => APP_ENV === 'local' || APP_ENV === 'development'
};

// Log loaded configuration (without sensitive data)
console.log('[CONFIG] Configuration loaded successfully');
console.log(`[CONFIG] Environment: ${config.APP_ENV}`);
console.log(`[CONFIG] Node Env: ${config.NODE_ENV}`);
console.log(`[CONFIG] Server Port: ${config.PORT}`);
console.log(`[CONFIG] Database: ${config.DATABASE.host}:${config.DATABASE.port}/${config.DATABASE.database}`);

// Freeze the config object to prevent accidental modifications
Object.freeze(config);

module.exports = config;

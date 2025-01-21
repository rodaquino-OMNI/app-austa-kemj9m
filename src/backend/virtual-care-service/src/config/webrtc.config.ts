// @package dotenv v16.3.1
import dotenv from 'dotenv';

// Initialize environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY',
  'TWILIO_API_SECRET',
  'TWILIO_REGION',
  'TURN_SERVER_URLS',
  'TURN_SERVER_USERNAME',
  'TURN_SERVER_CREDENTIAL'
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
});

// Twilio service configuration with enhanced security and performance settings
export const twilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  apiKey: process.env.TWILIO_API_KEY,
  apiSecret: process.env.TWILIO_API_SECRET,
  region: process.env.TWILIO_REGION,
  roomType: 'group' as const,
  maxParticipants: 2, // Default for 1:1 consultations
  tokenTTL: 3600, // 1 hour token validity
  recordingEnabled: true,
  recordingRules: {
    type: 'include',
    all: true,
    format: 'mp4',
    encryption: true,
  },
  automaticRetry: true,
  maxRetries: 3,
  retryInterval: 1000, // 1 second between retries
};

// Optimized WebRTC video and audio quality settings
export const videoConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 2,
    volume: 1.0,
  },
  video: {
    width: {
      min: 640,
      ideal: 1280,
      max: 1920,
    },
    height: {
      min: 480,
      ideal: 720,
      max: 1080,
    },
    frameRate: {
      min: 15,
      ideal: 30,
      max: 60,
    },
    facingMode: 'user' as const,
    aspectRatio: 1.777778, // 16:9
    resizeMode: 'crop-and-scale' as const,
  },
};

// Enhanced STUN/TURN server configuration with failover
export const iceServers = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
  {
    urls: process.env.TURN_SERVER_URLS?.split(',') || [],
    username: process.env.TURN_SERVER_USERNAME,
    credential: process.env.TURN_SERVER_CREDENTIAL,
    credentialType: 'password' as const,
    expiresIn: 86400, // 24 hours
    region: process.env.TWILIO_REGION,
  },
];

// Advanced network and bandwidth management settings
export const networkConfig = {
  maxBitrateKbps: 2500,
  minBitrateKbps: 250,
  adaptiveBitrate: true,
  maxPacketLossPercentage: 3,
  reconnectionTimeoutMs: 10000, // 10 seconds
  iceTransportPolicy: 'all' as const,
  bundlePolicy: 'max-bundle' as const,
  rtcpMuxPolicy: 'require' as const,
  degradationPreference: 'balanced' as const,
};

// HIPAA-compliant security settings
export const securityConfig = {
  encryptionEnabled: true,
  dtlsRole: 'auto' as const,
  keygenAlgorithm: 'ECDSA',
  cipherSuites: [
    'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384',
    'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
  ],
  certificateRotationInterval: 86400000, // 24 hours in milliseconds
  roomAccessControl: {
    requireAuthentication: true,
    allowedDomains: ['*.austa-health.com'],
    maxConcurrentSessions: 1,
    autoDisconnectTimeout: 3600000, // 1 hour in milliseconds
  },
  auditLogging: true,
  privacyMode: true,
};

// Export comprehensive WebRTC configuration
export const webRTCConfig = {
  twilioConfig,
  videoConstraints,
  iceServers,
  networkConfig,
  securityConfig,
};

export default webRTCConfig;
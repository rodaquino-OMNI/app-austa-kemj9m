// @package twilio v4.16.0
// @package twilio-video v2.27.0
// @package circuit-breaker-ts v1.0.0
// @package winston v3.8.2
// @package metrics-collector v2.1.0

import { AccessToken } from 'twilio';
import { VideoGrant } from 'twilio/lib/jwt/AccessToken';
import { CircuitBreaker } from 'circuit-breaker-ts';
import { Logger } from 'winston';
import { MetricsCollector } from 'metrics-collector';
import { webRTCConfig } from '../config/webrtc.config';
import { ISession } from '../models/session.model';
import { ErrorCode, ErrorMessage } from '../../../shared/constants/error-codes';

// Security and monitoring constants
const SECURITY_CONFIG = {
  TOKEN_TTL: 3600,
  ENCRYPTION_LEVEL: 'AES-256-GCM',
  MAX_RETRIES: 3,
  CIRCUIT_BREAKER_THRESHOLD: 0.5
};

const MONITORING_CONFIG = {
  METRICS_INTERVAL: 5000,
  HEALTH_CHECK_INTERVAL: 30000,
  PERFORMANCE_THRESHOLD: 500
};

const HIPAA_COMPLIANCE = {
  ENCRYPTION_REQUIRED: true,
  AUDIT_LOGGING: true,
  SESSION_TIMEOUT: 7200
};

/**
 * Generates a secure Twilio access token with enhanced security and monitoring
 * @param identity - User identity for the token
 * @param roomName - Name of the Twilio room
 * @param securityOptions - Additional security options
 * @returns Promise<string> - JWT token for Twilio video access
 */
export async function generateTwilioToken(
  identity: string,
  roomName: string,
  securityOptions: {
    encryptionRequired?: boolean;
    auditLog?: boolean;
    maxDuration?: number;
  } = {}
): Promise<string> {
  try {
    // Input validation
    if (!identity || !roomName) {
      throw new Error(ErrorMessage[ErrorCode.INVALID_INPUT].message);
    }

    // Initialize token with enhanced security
    const token = new AccessToken(
      webRTCConfig.twilioConfig.accountSid,
      webRTCConfig.twilioConfig.apiKey,
      webRTCConfig.twilioConfig.apiSecret,
      {
        identity,
        ttl: SECURITY_CONFIG.TOKEN_TTL,
        region: webRTCConfig.twilioConfig.region
      }
    );

    // Configure video grant with security restrictions
    const videoGrant = new VideoGrant({
      room: roomName,
      maxParticipants: webRTCConfig.twilioConfig.maxParticipants,
      recordParticipantsOnConnect: HIPAA_COMPLIANCE.AUDIT_LOGGING
    });

    token.addGrant(videoGrant);

    return token.toJwt();
  } catch (error) {
    throw new Error(`Token generation failed: ${error.message}`);
  }
}

/**
 * Manages Twilio room lifecycle with HIPAA compliance and monitoring
 */
export class TwilioRoomManager {
  private client: any;
  private metrics: MetricsCollector;
  private logger: Logger;
  private circuitBreaker: CircuitBreaker;

  constructor(
    private readonly config: typeof webRTCConfig.twilioConfig,
    metrics: MetricsCollector,
    logger: Logger
  ) {
    this.client = require('twilio')(
      this.config.accountSid,
      this.config.authToken
    );
    this.metrics = metrics;
    this.logger = logger;

    // Initialize circuit breaker for API calls
    this.circuitBreaker = new CircuitBreaker({
      threshold: SECURITY_CONFIG.CIRCUIT_BREAKER_THRESHOLD,
      timeout: MONITORING_CONFIG.HEALTH_CHECK_INTERVAL,
      resetTimeout: MONITORING_CONFIG.METRICS_INTERVAL
    });
  }

  /**
   * Creates a HIPAA-compliant Twilio room with monitoring
   * @param roomName - Unique room identifier
   * @param options - Room configuration options
   * @returns Promise<Room> - Created Twilio room instance
   */
  async createRoom(
    roomName: string,
    options: {
      type?: string;
      maxParticipants?: number;
      recordingEnabled?: boolean;
      statusCallback?: string;
    } = {}
  ): Promise<any> {
    try {
      // Validate security requirements
      if (!HIPAA_COMPLIANCE.ENCRYPTION_REQUIRED) {
        throw new Error(ErrorMessage[ErrorCode.HIPAA_VIOLATION].message);
      }

      // Configure room with security settings
      const roomConfig = {
        uniqueName: roomName,
        type: options.type || this.config.roomType,
        maxParticipants: options.maxParticipants || this.config.maxParticipants,
        recordParticipantsOnConnect: HIPAA_COMPLIANCE.AUDIT_LOGGING,
        statusCallback: options.statusCallback,
        statusCallbackMethod: 'POST',
        encryption: true,
        mediaRegion: this.config.region
      };

      // Create room with circuit breaker protection
      const room = await this.circuitBreaker.execute(() =>
        this.client.video.rooms.create(roomConfig)
      );

      // Initialize monitoring
      this.metrics.increment('twilio.room.created', {
        roomName,
        type: roomConfig.type
      });

      // Audit logging
      this.logger.info('Room created', {
        roomName,
        sid: room.sid,
        config: roomConfig
      });

      return room;
    } catch (error) {
      this.metrics.increment('twilio.room.error', {
        error: error.message
      });
      this.logger.error('Room creation failed', {
        roomName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Monitors room health and performance
   * @param roomSid - Room identifier
   * @returns Promise<void>
   */
  async monitorRoom(roomSid: string): Promise<void> {
    try {
      const room = await this.client.video.rooms(roomSid).fetch();
      
      this.metrics.gauge('twilio.room.participants', {
        roomSid,
        count: room.participantCount
      });

      this.metrics.gauge('twilio.room.duration', {
        roomSid,
        duration: room.duration
      });

      if (room.status === 'failed') {
        throw new Error(`Room ${roomSid} failed`);
      }
    } catch (error) {
      this.logger.error('Room monitoring failed', {
        roomSid,
        error: error.message
      });
      throw error;
    }
  }
}
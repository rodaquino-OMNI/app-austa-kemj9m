/**
 * @fileoverview Virtual Care Session Model with HIPAA compliance and enhanced monitoring
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { Schema, model, Document } from 'mongoose';
import { IUser, UserRole } from '../../../shared/interfaces/user.interface';
import { IHealthRecord } from '../../../shared/interfaces/health-record.interface';
import { webRTCConfig } from '../config/webrtc.config';
import { ErrorCode } from '../../../shared/constants/error-codes';

/**
 * Enum for comprehensive session status tracking
 */
export enum SessionStatus {
    SCHEDULED = 'SCHEDULED',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
    FAILED = 'FAILED'
}

/**
 * Interface for detailed network performance metrics
 */
interface INetworkMetrics {
    bitrate: number;
    packetLoss: number;
    latency: number;
    jitter: number;
    qualityScore: number;
}

/**
 * Interface for device information tracking
 */
interface IDeviceInfo {
    type: string;
    os: string;
    browser: string;
    webRTCSupport: boolean;
    networkType: string;
}

/**
 * Enhanced interface for session participant tracking
 */
export interface ISessionParticipant {
    userId: string;
    role: UserRole;
    joinedAt: Date;
    leftAt?: Date;
    connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
    deviceInfo: IDeviceInfo;
    networkMetrics: INetworkMetrics;
}

/**
 * Interface for HIPAA compliance tracking
 */
interface IHIPAACompliance {
    encryptionVerified: boolean;
    dataPrivacyChecks: boolean;
    consentObtained: boolean;
    auditLogComplete: boolean;
    complianceVersion: string;
}

/**
 * Interface for comprehensive session performance metrics
 */
interface IPerformanceMetrics {
    averageLatency: number;
    packetLossRate: number;
    bitrateUtilization: number;
    frameRate: number;
    resolution: string;
    qualityScore: number;
    networkStability: number;
}

/**
 * Enhanced interface for virtual care session
 */
export interface ISession extends Document {
    id: string;
    patientId: string;
    providerId: string;
    scheduledStartTime: Date;
    actualStartTime?: Date;
    endTime?: Date;
    status: SessionStatus;
    participants: ISessionParticipant[];
    healthRecordId?: string;
    twilioRoomSid: string;
    metadata: {
        consultationType: string;
        priority: string;
        notes: string;
        tags: string[];
    };
    performanceMetrics: IPerformanceMetrics;
    auditLog: Array<{
        timestamp: Date;
        action: string;
        userId: string;
        details: string;
    }>;
    hipaaCompliance: IHIPAACompliance;
}

/**
 * Create enhanced mongoose schema for session model with optimizations
 */
const createSessionSchema = (): Schema => {
    const sessionSchema = new Schema({
        patientId: {
            type: String,
            required: true,
            index: true
        },
        providerId: {
            type: String,
            required: true,
            index: true
        },
        scheduledStartTime: {
            type: Date,
            required: true,
            index: true
        },
        actualStartTime: {
            type: Date,
            index: true
        },
        endTime: {
            type: Date
        },
        status: {
            type: String,
            enum: Object.values(SessionStatus),
            required: true,
            default: SessionStatus.SCHEDULED,
            index: true
        },
        participants: [{
            userId: {
                type: String,
                required: true
            },
            role: {
                type: String,
                enum: Object.values(UserRole),
                required: true
            },
            joinedAt: {
                type: Date,
                required: true
            },
            leftAt: {
                type: Date
            },
            connectionStatus: {
                type: String,
                enum: ['CONNECTED', 'DISCONNECTED', 'RECONNECTING'],
                required: true
            },
            deviceInfo: {
                type: {
                    type: String,
                    required: true
                },
                os: String,
                browser: String,
                webRTCSupport: Boolean,
                networkType: String
            },
            networkMetrics: {
                bitrate: Number,
                packetLoss: Number,
                latency: Number,
                jitter: Number,
                qualityScore: Number
            }
        }],
        healthRecordId: {
            type: String,
            index: true
        },
        twilioRoomSid: {
            type: String,
            required: true,
            unique: true
        },
        metadata: {
            consultationType: String,
            priority: String,
            notes: String,
            tags: [String]
        },
        performanceMetrics: {
            averageLatency: Number,
            packetLossRate: Number,
            bitrateUtilization: Number,
            frameRate: Number,
            resolution: String,
            qualityScore: Number,
            networkStability: Number
        },
        auditLog: [{
            timestamp: {
                type: Date,
                required: true
            },
            action: {
                type: String,
                required: true
            },
            userId: {
                type: String,
                required: true
            },
            details: String
        }],
        hipaaCompliance: {
            encryptionVerified: {
                type: Boolean,
                required: true,
                default: false
            },
            dataPrivacyChecks: {
                type: Boolean,
                required: true,
                default: false
            },
            consentObtained: {
                type: Boolean,
                required: true,
                default: false
            },
            auditLogComplete: {
                type: Boolean,
                required: true,
                default: false
            },
            complianceVersion: {
                type: String,
                required: true,
                default: '1.0'
            }
        }
    }, {
        timestamps: true,
        collection: 'sessions'
    });

    // Optimize indexes for common queries
    sessionSchema.index({ 'participants.userId': 1 });
    sessionSchema.index({ scheduledStartTime: 1, status: 1 });
    sessionSchema.index({ patientId: 1, status: 1 });
    sessionSchema.index({ providerId: 1, status: 1 });

    // Add validation middleware
    sessionSchema.pre('save', async function(next) {
        if (!this.validateParticipants()) {
            throw new Error(ErrorCode.INVALID_INPUT);
        }
        
        if (!this.hipaaCompliance.encryptionVerified) {
            throw new Error(ErrorCode.HIPAA_VIOLATION);
        }
        
        next();
    });

    return sessionSchema;
};

/**
 * Enhanced Mongoose model for virtual care sessions
 */
export const SessionModel = model<ISession>('Session', createSessionSchema());

export default SessionModel;
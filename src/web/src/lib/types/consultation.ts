/**
 * @fileoverview Consultation type definitions for AUSTA SuperApp virtual care platform
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { Room, LocalTrack, RemoteParticipant } from 'twilio-video'; // v2.27.0
import { IUser, UserRole } from '../types/user';

/**
 * Enum defining available consultation modalities
 * Supports multiple communication channels for virtual care
 */
export enum ConsultationType {
    VIDEO = 'VIDEO',
    AUDIO = 'AUDIO',
    CHAT = 'CHAT'
}

/**
 * Enum defining possible consultation session states
 * Tracks complete lifecycle of virtual care sessions
 */
export enum ConsultationStatus {
    SCHEDULED = 'SCHEDULED',
    WAITING = 'WAITING',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
    FAILED = 'FAILED'
}

/**
 * Enum defining WebRTC connection quality levels
 * Used for monitoring and reporting session quality
 */
export enum ConnectionQuality {
    EXCELLENT = 'EXCELLENT',
    GOOD = 'GOOD',
    FAIR = 'FAIR',
    POOR = 'POOR',
    DISCONNECTED = 'DISCONNECTED'
}

/**
 * Interface for tracking consultation participant details
 * Includes comprehensive monitoring of participant state and metrics
 */
export interface IConsultationParticipant {
    userId: string;
    role: UserRole;
    joinedAt: Date;
    leftAt: Date | null;
    isAudioEnabled: boolean;
    isVideoEnabled: boolean;
    connectionQuality: ConnectionQuality;
    deviceInfo: Record<string, string>;
    networkStats: Record<string, number>;
}

/**
 * Interface for virtual care consultation data
 * Implements HIPAA-compliant session management with audit tracking
 */
export interface IConsultation {
    id: string;
    type: ConsultationType;
    patientId: string;
    providerId: string;
    scheduledStartTime: Date;
    actualStartTime: Date | null;
    endTime: Date | null;
    status: ConsultationStatus;
    participants: readonly IConsultationParticipant[];
    healthRecordId: string | null;
    roomSid: string | null;
    metadata: Record<string, unknown>;
    securityMetadata: Record<string, string>;
    auditLog: readonly Record<string, any>[];
}

/**
 * Interface for WebRTC room management
 * Implements secure video/audio streaming with encryption verification
 */
export interface IConsultationRoom {
    room: Room;
    localTracks: readonly LocalTrack[];
    participants: ReadonlyMap<string, RemoteParticipant>;
    connectionState: ConnectionQuality;
    encryptionEnabled: boolean;
}

/**
 * Type guard to check if a participant is a healthcare provider
 * @param participant The consultation participant to check
 * @returns boolean indicating if participant is a provider
 */
export const isProvider = (participant: IConsultationParticipant): boolean => {
    return participant.role === UserRole.PROVIDER;
};

/**
 * Type guard to check if a consultation is active
 * @param consultation The consultation to check
 * @returns boolean indicating if consultation is currently active
 */
export const isActiveConsultation = (consultation: IConsultation): boolean => {
    return consultation.status === ConsultationStatus.IN_PROGRESS ||
           consultation.status === ConsultationStatus.WAITING;
};

/**
 * Type guard to check if a consultation room is secure
 * @param room The consultation room to check
 * @returns boolean indicating if room meets security requirements
 */
export const isSecureRoom = (room: IConsultationRoom): boolean => {
    return room.encryptionEnabled && room.connectionState !== ConnectionQuality.DISCONNECTED;
};
/**
 * @fileoverview Enhanced React hook for managing secure, HIPAA-compliant WebRTC video consultations
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { Room, LocalTrack, RemoteParticipant } from 'twilio-video'; // v2.27.0

import { virtualCareApi } from '../lib/api/virtualCare';
import {
  IConsultation,
  IConsultationRoom,
  ConsultationStatus,
  ConnectionQuality,
  isSecureRoom
} from '../lib/types/consultation';

// Constants for WebRTC configuration
const QUALITY_CHECK_INTERVAL = 10000; // 10 seconds
const MAX_RECONNECTION_ATTEMPTS = 3;
const QUALITY_THRESHOLD = {
  POOR: 2,
  FAIR: 3,
  GOOD: 4
};

// Custom error types for WebRTC operations
interface WebRTCError extends Error {
  code: string;
  details?: any;
}

/**
 * Enhanced hook for managing WebRTC video consultation sessions with security and quality monitoring
 * @param consultationId - Unique identifier for the consultation session
 * @param securityContext - Security context for HIPAA compliance
 */
export const useWebRTC = (
  consultationId: string,
  securityContext: Record<string, any>
) => {
  // State management for WebRTC session
  const [room, setRoom] = useState<IConsultationRoom | null>(null);
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([]);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<WebRTCError | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(ConnectionQuality.GOOD);

  // Refs for managing intervals and connection state
  const reconnectionAttempts = useRef<number>(0);
  const qualityCheckInterval = useRef<NodeJS.Timeout>();
  const isComponentMounted = useRef<boolean>(true);

  /**
   * Monitors and reports connection quality metrics
   */
  const monitorConnectionQuality = useCallback(async () => {
    if (!room?.room) return;

    try {
      const stats = await room.room.getStats();
      let audioLevel = 0;
      let videoBitrate = 0;
      let packetLoss = 0;

      // Process stats reports
      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          if (report.kind === 'audio') {
            audioLevel = report.audioLevel || 0;
          } else if (report.kind === 'video') {
            videoBitrate = report.bytesReceived || 0;
          }
          packetLoss = report.packetsLost || 0;
        }
      });

      let quality = ConnectionQuality.GOOD;
      if (packetLoss > 5) {
        quality = ConnectionQuality.POOR;
      } else if (videoBitrate < 500000) {
        quality = ConnectionQuality.FAIR;
      }

      setConnectionQuality(quality);
      
      // Log quality metrics instead of reporting since API doesn't support it
      console.info('Connection quality metrics:', {
        consultationId,
        quality,
        metrics: { audioLevel, videoBitrate, packetLoss }
      });
    } catch (err) {
      console.error('Failed to monitor connection quality:', err);
    }
  }, [room, consultationId]);

  /**
   * Initializes and connects to the WebRTC session
   */
  const initializeConnection = useCallback(async () => {
    if (!consultationId || !securityContext) return;

    setIsConnecting(true);
    setError(null);

    try {
      const consultationRoom = await virtualCareApi.joinConsultation(
        consultationId,
        securityContext
      );

      if (!isSecureRoom(consultationRoom)) {
        throw new Error('Room security verification failed');
      }

      setRoom(consultationRoom);
      setLocalTracks(Array.from(consultationRoom.localTracks));
      setRemoteParticipants(new Map(consultationRoom.participants));

      // Start quality monitoring
      qualityCheckInterval.current = setInterval(monitorConnectionQuality, QUALITY_CHECK_INTERVAL);
    } catch (err: any) {
      setError({
        name: 'ConnectionError',
        message: 'Failed to establish secure connection',
        code: err.code || 'UNKNOWN_ERROR',
        details: err
      });
    } finally {
      setIsConnecting(false);
    }
  }, [consultationId, securityContext, monitorConnectionQuality]);

  /**
   * Handles automatic reconnection on connection failure
   */
  const handleReconnection = useCallback(async () => {
    if (reconnectionAttempts.current >= MAX_RECONNECTION_ATTEMPTS) {
      setError({
        name: 'ReconnectionError',
        message: 'Maximum reconnection attempts reached',
        code: 'MAX_RETRIES_EXCEEDED'
      });
      return;
    }

    reconnectionAttempts.current += 1;
    await initializeConnection();
  }, [initializeConnection]);

  /**
   * Toggles local audio track
   */
  const toggleAudio = useCallback(async () => {
    if (!room?.room) return;

    const audioTrack = localTracks.find(track => track.kind === 'audio');
    if (audioTrack) {
      if (audioTrack.isEnabled) {
        audioTrack.disable();
      } else {
        audioTrack.enable();
      }
    }
  }, [localTracks, room]);

  /**
   * Toggles local video track
   */
  const toggleVideo = useCallback(async () => {
    if (!room?.room) return;

    const videoTrack = localTracks.find(track => track.kind === 'video');
    if (videoTrack) {
      if (videoTrack.isEnabled) {
        videoTrack.disable();
      } else {
        videoTrack.enable();
      }
    }
  }, [localTracks, room]);

  /**
   * Initiates screen sharing
   */
  const shareScreen = useCallback(async () => {
    if (!room?.room) return;

    try {
      const screenTrack = await navigator.mediaDevices.getDisplayMedia();
      await room.room.localParticipant.publishTrack(screenTrack.getTracks()[0]);
    } catch (err: any) {
      setError({
        name: 'ScreenShareError',
        message: 'Failed to start screen sharing',
        code: err.code || 'SCREEN_SHARE_ERROR',
        details: err
      });
    }
  }, [room]);

  /**
   * Disconnects from the WebRTC session
   */
  const disconnect = useCallback(async () => {
    if (!room?.room) return;

    try {
      await virtualCareApi.endConsultation(consultationId);
      room.room.disconnect();
      setRoom(null);
      setLocalTracks([]);
      setRemoteParticipants(new Map());
    } catch (err: any) {
      setError({
        name: 'DisconnectionError',
        message: 'Failed to disconnect properly',
        code: err.code || 'DISCONNECT_ERROR',
        details: err
      });
    }
  }, [room, consultationId]);

  /**
   * Retrieves current connection quality statistics
   */
  const getConnectionStats = useCallback(async () => {
    if (!room?.room) {
      throw new Error('Room not connected');
    }
    return room.room.getStats();
  }, [room]);

  // Setup and cleanup effects
  useEffect(() => {
    initializeConnection();

    return () => {
      isComponentMounted.current = false;
      if (qualityCheckInterval.current) {
        clearInterval(qualityCheckInterval.current);
      }
      disconnect();
    };
  }, [initializeConnection, disconnect]);

  // Handle room events
  useEffect(() => {
    if (!room?.room) return;

    const handleParticipantConnected = (participant: RemoteParticipant) => {
      setRemoteParticipants(prev => new Map(prev).set(participant.sid, participant));
    };

    const handleParticipantDisconnected = (participant: RemoteParticipant) => {
      setRemoteParticipants(prev => {
        const newMap = new Map(prev);
        newMap.delete(participant.sid);
        return newMap;
      });
    };

    const handleDisconnected = () => {
      handleReconnection();
    };

    room.room.on('participantConnected', handleParticipantConnected);
    room.room.on('participantDisconnected', handleParticipantDisconnected);
    room.room.on('disconnected', handleDisconnected);

    return () => {
      room.room.off('participantConnected', handleParticipantConnected);
      room.room.off('participantDisconnected', handleParticipantDisconnected);
      room.room.off('disconnected', handleDisconnected);
    };
  }, [room, handleReconnection]);

  return {
    room,
    localTracks,
    remoteParticipants,
    isConnecting,
    error,
    connectionQuality,
    toggleAudio,
    toggleVideo,
    disconnect,
    reconnect: handleReconnection,
    shareScreen,
    getConnectionStats
  };
};
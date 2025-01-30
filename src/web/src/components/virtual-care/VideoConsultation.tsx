/**
 * @fileoverview HIPAA-compliant video consultation component for AUSTA SuperApp
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { 
  Grid, 
  Paper, 
  Typography, 
  CircularProgress, 
  Alert,
  IconButton,
  Box,
  Tooltip
} from '@mui/material'; // v5.14.0
import {
  Mic, MicOff,
  Videocam, VideocamOff,
  ScreenShare, StopScreenShare,
  Security,
  SignalCellular4Bar,
  SignalCellular2Bar,
  SignalCellular0Bar
} from '@mui/icons-material'; // v5.14.0

import { useWebRTC } from '../../hooks/useWebRTC';
import { 
  IConsultation, 
  ConsultationStatus, 
  ConnectionQuality,
  isSecureRoom 
} from '../../lib/types/consultation';

// Security violation types for monitoring
type SecurityViolation = 'ENCRYPTION_FAILED' | 'CONNECTION_INSECURE' | 'QUALITY_DEGRADED';

// Props interface with security features
interface IVideoConsultationProps {
  consultation: IConsultation;
  onEnd: () => void;
  onSecurityViolation: (violation: SecurityViolation) => void;
  onQualityChange: (quality: ConnectionQuality) => void;
}

// Interface for tracking security status
interface ISecurityStatus {
  isEncrypted: boolean;
  encryptionVerified: boolean;
  lastVerification: Date;
  securityViolations: SecurityViolation[];
}

/**
 * HIPAA-compliant video consultation component
 * Implements secure video communication with encryption verification
 */
const VideoConsultation: React.FC<IVideoConsultationProps> = ({
  consultation,
  onEnd,
  onSecurityViolation,
  onQualityChange
}) => {
  // Initialize WebRTC hook with security context
  const {
    room,
    localTracks,
    remoteParticipants,
    isConnecting,
    error,
    connectionQuality,
    toggleAudio,
    toggleVideo,
    shareScreen,
    disconnect,
    getConnectionStats
  } = useWebRTC(consultation.id, {
    encryptionRequired: true,
    securityLevel: 'HIPAA'
  });

  // Local state management
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<ISecurityStatus>({
    isEncrypted: false,
    encryptionVerified: false,
    lastVerification: new Date(),
    securityViolations: []
  });

  // Refs for monitoring intervals
  const securityCheckInterval = useRef<NodeJS.Timeout>();
  const qualityMonitorInterval = useRef<NodeJS.Timeout>();

  /**
   * Verifies encryption and security status
   */
  const verifySecurityStatus = useCallback(() => {
    if (!room) return;

    const newStatus = {
      isEncrypted: room.encryptionEnabled,
      encryptionVerified: isSecureRoom(room),
      lastVerification: new Date(),
      securityViolations: [...securityStatus.securityViolations]
    };

    if (!newStatus.isEncrypted) {
      newStatus.securityViolations.push('ENCRYPTION_FAILED');
      onSecurityViolation('ENCRYPTION_FAILED');
    }

    if (!newStatus.encryptionVerified) {
      newStatus.securityViolations.push('CONNECTION_INSECURE');
      onSecurityViolation('CONNECTION_INSECURE');
    }

    setSecurityStatus(newStatus);
  }, [room, onSecurityViolation, securityStatus.securityViolations]);

  /**
   * Handles audio toggle with state management
   */
  const handleAudioToggle = useCallback(async () => {
    await toggleAudio();
    setIsAudioEnabled(prev => !prev);
  }, [toggleAudio]);

  /**
   * Handles video toggle with state management
   */
  const handleVideoToggle = useCallback(async () => {
    await toggleVideo();
    setIsVideoEnabled(prev => !prev);
  }, [toggleVideo]);

  /**
   * Handles screen sharing with security verification
   */
  const handleScreenShare = useCallback(async () => {
    if (!securityStatus.encryptionVerified) {
      onSecurityViolation('CONNECTION_INSECURE');
      return;
    }
    await shareScreen();
    setIsScreenSharing(prev => !prev);
  }, [shareScreen, securityStatus.encryptionVerified, onSecurityViolation]);

  /**
   * Handles consultation end with cleanup
   */
  const handleEndConsultation = useCallback(async () => {
    await disconnect();
    onEnd();
  }, [disconnect, onEnd]);

  // Set up security monitoring
  useEffect(() => {
    securityCheckInterval.current = setInterval(verifySecurityStatus, 10000);
    qualityMonitorInterval.current = setInterval(async () => {
      const stats = await getConnectionStats();
      if (stats && connectionQuality === ConnectionQuality.POOR) {
        onSecurityViolation('QUALITY_DEGRADED');
      }
      onQualityChange(connectionQuality);
    }, 5000);

    return () => {
      if (securityCheckInterval.current) {
        clearInterval(securityCheckInterval.current);
      }
      if (qualityMonitorInterval.current) {
        clearInterval(qualityMonitorInterval.current);
      }
    };
  }, [verifySecurityStatus, getConnectionStats, connectionQuality, onQualityChange, onSecurityViolation]);

  // Render loading state
  if (isConnecting) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%">
        <CircularProgress />
        <Typography variant="h6" ml={2}>
          Establishing Secure Connection...
        </Typography>
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Alert severity="error" variant="filled">
        Connection Error: {error.message}
      </Alert>
    );
  }

  return (
    <Paper elevation={3} sx={{ height: '100%', p: 2 }}>
      {/* Security Status Banner */}
      <Alert 
        severity={securityStatus.encryptionVerified ? "success" : "warning"}
        sx={{ mb: 2 }}
      >
        {securityStatus.encryptionVerified 
          ? "Secure HIPAA-compliant connection established"
          : "Connection security verification in progress"}
      </Alert>

      {/* Video Grid */}
      <Grid container spacing={2} sx={{ height: 'calc(100% - 120px)' }}>
        {/* Remote Participant Video */}
        <Grid item xs={12} md={8}>
          <Box
            sx={{
              height: '100%',
              backgroundColor: 'black',
              position: 'relative'
            }}
          >
            {Array.from(remoteParticipants.values()).map(participant => (
              <video
                key={participant.sid}
                ref={el => {
                  if (el && participant.videoTracks.size > 0) {
                    const trackPublication = Array.from(participant.videoTracks.values())[0];
                    if (trackPublication.track) {
                      const mediaStreamTrack = trackPublication.track.mediaStreamTrack;
                      el.srcObject = new MediaStream([mediaStreamTrack]);
                    }
                  }
                }}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ))}
          </Box>
        </Grid>

        {/* Local Video */}
        <Grid item xs={12} md={4}>
          <Box
            sx={{
              height: '100%',
              backgroundColor: 'black',
              position: 'relative'
            }}
          >
            <video
              ref={el => {
                if (el && localTracks.find(track => track.kind === 'video')) {
                  const videoTrack = localTracks.find(track => track.kind === 'video');
                  el.srcObject = new MediaStream([videoTrack!]);
                }
              }}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </Box>
        </Grid>
      </Grid>

      {/* Control Bar */}
      <Box
        sx={{
          mt: 2,
          p: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          borderRadius: 1
        }}
      >
        <Box>
          <Tooltip title={isAudioEnabled ? "Mute Audio" : "Unmute Audio"}>
            <IconButton onClick={handleAudioToggle}>
              {isAudioEnabled ? <Mic /> : <MicOff color="error" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={isVideoEnabled ? "Stop Video" : "Start Video"}>
            <IconButton onClick={handleVideoToggle}>
              {isVideoEnabled ? <Videocam /> : <VideocamOff color="error" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={isScreenSharing ? "Stop Sharing" : "Share Screen"}>
            <IconButton onClick={handleScreenShare}>
              {isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
            </IconButton>
          </Tooltip>
        </Box>

        <Box display="flex" alignItems="center">
          <Tooltip title={`Connection: ${connectionQuality}`}>
            <IconButton>
              {connectionQuality === ConnectionQuality.GOOD && <SignalCellular4Bar color="success" />}
              {connectionQuality === ConnectionQuality.FAIR && <SignalCellular2Bar color="warning" />}
              {connectionQuality === ConnectionQuality.POOR && <SignalCellular0Bar color="error" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={`Security: ${securityStatus.encryptionVerified ? 'Verified' : 'Verifying'}`}>
            <IconButton>
              <Security color={securityStatus.encryptionVerified ? "success" : "warning"} />
            </IconButton>
          </Tooltip>
          <IconButton
            color="error"
            onClick={handleEndConsultation}
          >
            End
          </IconButton>
        </Box>
      </Box>
    </Paper>
  );
};

export default VideoConsultation;
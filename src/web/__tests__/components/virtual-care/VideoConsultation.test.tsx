import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mockWebRTC } from '@testing-library/webrtc-mock';
import { useEncryption } from '@healthcare/encryption';

import VideoConsultation from '../../../src/components/virtual-care/VideoConsultation';
import { useWebRTC } from '../../../src/hooks/useWebRTC';
import { 
  ConsultationStatus, 
  ConnectionQuality,
  ConsultationType 
} from '../../../src/lib/types/consultation';

// Mock the WebRTC hook
vi.mock('../../../src/hooks/useWebRTC');
vi.mock('@healthcare/encryption');

// Mock consultation data
const mockConsultation = {
  id: 'test-consultation-123',
  type: ConsultationType.VIDEO,
  status: ConsultationStatus.IN_PROGRESS,
  patientId: 'patient-123',
  providerId: 'provider-456',
  scheduledStartTime: new Date(),
  actualStartTime: new Date(),
  endTime: null,
  participants: [],
  healthRecordId: 'health-123',
  roomSid: 'room-789',
  metadata: {},
  securityMetadata: {
    encryptionLevel: 'AES-256-GCM',
    hipaaCompliant: 'true'
  },
  auditLog: []
};

// Mock WebRTC tracks
const mockLocalTracks = [
  { kind: 'video', enabled: true, id: 'local-video' },
  { kind: 'audio', enabled: true, id: 'local-audio' }
];

const mockRemoteParticipants = new Map([
  ['remote-1', {
    sid: 'remote-1',
    videoTracks: new Map([['track-1', { track: { kind: 'video' } }]]),
    audioTracks: new Map([['track-2', { track: { kind: 'audio' } }]])
  }]
]);

describe('VideoConsultation Component', () => {
  // Setup mocks before each test
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock WebRTC hook implementation
    (useWebRTC as any).mockReturnValue({
      room: {
        room: {
          encryptionEnabled: true,
          disconnect: vi.fn()
        }
      },
      localTracks: mockLocalTracks,
      remoteParticipants: mockRemoteParticipants,
      isConnecting: false,
      error: null,
      connectionQuality: ConnectionQuality.GOOD,
      toggleAudio: vi.fn(),
      toggleVideo: vi.fn(),
      shareScreen: vi.fn(),
      disconnect: vi.fn(),
      getConnectionStats: vi.fn()
    });

    // Mock encryption hook
    (useEncryption as any).mockReturnValue({
      isEncrypted: true,
      encryptionStatus: 'ACTIVE',
      verifyEncryption: vi.fn().mockResolvedValue(true)
    });
  });

  it('should render with secure connection', async () => {
    const onEnd = vi.fn();
    const onSecurityViolation = vi.fn();
    const onQualityChange = vi.fn();

    render(
      <VideoConsultation
        consultation={mockConsultation}
        onEnd={onEnd}
        onSecurityViolation={onSecurityViolation}
        onQualityChange={onQualityChange}
      />
    );

    // Verify secure connection banner
    expect(screen.getByText(/Secure HIPAA-compliant connection established/i)).toBeInTheDocument();

    // Verify video elements
    const videos = screen.getAllByRole('video');
    expect(videos).toHaveLength(2); // Local and remote video
  });

  it('should handle audio toggle securely', async () => {
    const onSecurityViolation = vi.fn();

    render(
      <VideoConsultation
        consultation={mockConsultation}
        onEnd={vi.fn()}
        onSecurityViolation={onSecurityViolation}
        onQualityChange={vi.fn()}
      />
    );

    const audioButton = screen.getByRole('button', { name: /mute audio/i });
    await fireEvent.click(audioButton);

    expect(useWebRTC().toggleAudio).toHaveBeenCalled();
    expect(onSecurityViolation).not.toHaveBeenCalled();
  });

  it('should enforce encryption for screen sharing', async () => {
    const onSecurityViolation = vi.fn();

    // Mock encryption verification failure
    (useEncryption as any).mockReturnValue({
      isEncrypted: false,
      encryptionStatus: 'FAILED',
      verifyEncryption: vi.fn().mockResolvedValue(false)
    });

    render(
      <VideoConsultation
        consultation={mockConsultation}
        onEnd={vi.fn()}
        onSecurityViolation={onSecurityViolation}
        onQualityChange={vi.fn()}
      />
    );

    const shareButton = screen.getByRole('button', { name: /share screen/i });
    await fireEvent.click(shareButton);

    expect(useWebRTC().shareScreen).not.toHaveBeenCalled();
    expect(onSecurityViolation).toHaveBeenCalledWith('CONNECTION_INSECURE');
  });

  it('should monitor connection quality', async () => {
    const onQualityChange = vi.fn();
    
    // Mock poor connection quality
    (useWebRTC as any).mockReturnValue({
      ...useWebRTC(),
      connectionQuality: ConnectionQuality.POOR,
      getConnectionStats: vi.fn().mockResolvedValue({
        bytesReceived: 1000,
        packetsLost: 50,
        jitter: 100
      })
    });

    render(
      <VideoConsultation
        consultation={mockConsultation}
        onEnd={vi.fn()}
        onSecurityViolation={vi.fn()}
        onQualityChange={onQualityChange}
      />
    );

    await waitFor(() => {
      expect(onQualityChange).toHaveBeenCalledWith(ConnectionQuality.POOR);
    });

    // Verify quality indicator
    const qualityIcon = screen.getByTestId('SignalCellular0BarIcon');
    expect(qualityIcon).toHaveClass('MuiSvgIcon-colorError');
  });

  it('should handle secure disconnection', async () => {
    const onEnd = vi.fn();

    render(
      <VideoConsultation
        consultation={mockConsultation}
        onEnd={onEnd}
        onSecurityViolation={vi.fn()}
        onQualityChange={vi.fn()}
      />
    );

    const endButton = screen.getByRole('button', { name: /end/i });
    await fireEvent.click(endButton);

    expect(useWebRTC().disconnect).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });

  it('should display loading state securely', () => {
    // Mock connecting state
    (useWebRTC as any).mockReturnValue({
      ...useWebRTC(),
      isConnecting: true
    });

    render(
      <VideoConsultation
        consultation={mockConsultation}
        onEnd={vi.fn()}
        onSecurityViolation={vi.fn()}
        onQualityChange={vi.fn()}
      />
    );

    expect(screen.getByText(/establishing secure connection/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should handle connection errors appropriately', () => {
    // Mock connection error
    (useWebRTC as any).mockReturnValue({
      ...useWebRTC(),
      error: new Error('Failed to establish secure connection')
    });

    render(
      <VideoConsultation
        consultation={mockConsultation}
        onEnd={vi.fn()}
        onSecurityViolation={vi.fn()}
        onQualityChange={vi.fn()}
      />
    );

    expect(screen.getByText(/connection error/i)).toBeInTheDocument();
    expect(screen.getByText(/failed to establish secure connection/i)).toBeInTheDocument();
  });

  it('should verify security status periodically', async () => {
    const onSecurityViolation = vi.fn();

    // Mock security verification
    vi.useFakeTimers();

    render(
      <VideoConsultation
        consultation={mockConsultation}
        onEnd={vi.fn()}
        onSecurityViolation={onSecurityViolation}
        onQualityChange={vi.fn()}
      />
    );

    // Advance timers to trigger security check
    await vi.advanceTimersByTime(10000);

    expect(onSecurityViolation).not.toHaveBeenCalled();
    expect(screen.getByText(/secure hipaa-compliant connection established/i)).toBeInTheDocument();

    // Cleanup
    vi.useRealTimers();
  });

  it('should handle video toggle with security verification', async () => {
    render(
      <VideoConsultation
        consultation={mockConsultation}
        onEnd={vi.fn()}
        onSecurityViolation={vi.fn()}
        onQualityChange={vi.fn()}
      />
    );

    const videoButton = screen.getByRole('button', { name: /stop video/i });
    await fireEvent.click(videoButton);

    expect(useWebRTC().toggleVideo).toHaveBeenCalled();
  });
});
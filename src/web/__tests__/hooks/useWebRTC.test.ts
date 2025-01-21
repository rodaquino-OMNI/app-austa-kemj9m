import { renderHook, act } from '@testing-library/react'; // v14.0.0
import { describe, beforeEach, it, jest, expect } from '@jest/globals'; // v29.6.0
import { Room, LocalTrack, RemoteParticipant, ConnectionQuality } from 'twilio-video'; // v2.27.0

import { useWebRTC } from '../../src/hooks/useWebRTC';
import { virtualCareApi } from '../../src/lib/api/virtualCare';
import { ConsultationStatus, ConnectionQuality as AppConnectionQuality } from '../../src/lib/types/consultation';

// Mock Twilio Video
jest.mock('twilio-video', () => ({
  Room: jest.fn(),
  LocalTrack: jest.fn(),
  RemoteParticipant: jest.fn(),
  ConnectionQuality: {
    EXCELLENT: 'EXCELLENT',
    GOOD: 'GOOD',
    FAIR: 'FAIR',
    POOR: 'POOR'
  }
}));

// Mock virtual care API
jest.mock('../../src/lib/api/virtualCare', () => ({
  virtualCareApi: {
    joinConsultation: jest.fn(),
    endConsultation: jest.fn(),
    reportConnectionQuality: jest.fn()
  }
}));

describe('useWebRTC Hook', () => {
  // Test constants
  const MOCK_CONSULTATION_ID = 'test-consultation-123';
  const MOCK_SECURITY_CONTEXT = {
    encryptionLevel: 'AES-256-GCM',
    hipaaCompliant: true,
    securityVersion: '1.0'
  };

  // Mock room and tracks
  let mockRoom: jest.Mocked<Room>;
  let mockLocalTrack: jest.Mocked<LocalTrack>;
  let mockRemoteParticipant: jest.Mocked<RemoteParticipant>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock media devices
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [mockLocalTrack]
        }),
        getDisplayMedia: jest.fn().mockResolvedValue({
          getTracks: () => [mockLocalTrack]
        })
      }
    });

    // Initialize mock room and tracks
    mockRoom = {
      sid: 'mock-room-sid',
      localParticipant: {
        tracks: new Map(),
        publishTrack: jest.fn(),
        setToken: jest.fn()
      },
      participants: new Map(),
      disconnect: jest.fn(),
      getStats: jest.fn().mockResolvedValue({
        audioInputLevel: 50,
        videoBitrate: 1000000,
        packetLoss: 0
      }),
      on: jest.fn(),
      off: jest.fn()
    } as unknown as jest.Mocked<Room>;

    mockLocalTrack = {
      kind: 'video',
      isEnabled: true,
      enable: jest.fn(),
      disable: jest.fn()
    } as unknown as jest.Mocked<LocalTrack>;

    mockRemoteParticipant = {
      sid: 'mock-participant-sid',
      identity: 'remote-user'
    } as unknown as jest.Mocked<RemoteParticipant>;

    // Setup API mock responses
    (virtualCareApi.joinConsultation as jest.Mock).mockResolvedValue({
      room: mockRoom,
      localTracks: [mockLocalTrack],
      participants: new Map(),
      connectionState: AppConnectionQuality.GOOD,
      encryptionEnabled: true
    });
  });

  it('should initialize with security context and verify encryption', async () => {
    const { result } = renderHook(() => useWebRTC(MOCK_CONSULTATION_ID, MOCK_SECURITY_CONTEXT));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(virtualCareApi.joinConsultation).toHaveBeenCalledWith(
      MOCK_CONSULTATION_ID,
      MOCK_SECURITY_CONTEXT
    );
    expect(result.current.room?.encryptionEnabled).toBe(true);
  });

  it('should monitor and report connection quality', async () => {
    const { result } = renderHook(() => useWebRTC(MOCK_CONSULTATION_ID, MOCK_SECURITY_CONTEXT));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Simulate quality check interval
    jest.advanceTimersByTime(10000);

    expect(mockRoom.getStats).toHaveBeenCalled();
    expect(virtualCareApi.reportConnectionQuality).toHaveBeenCalledWith({
      consultationId: MOCK_CONSULTATION_ID,
      quality: AppConnectionQuality.GOOD,
      metrics: expect.any(Object)
    });
  });

  it('should handle connection failures with automatic reconnection', async () => {
    const { result } = renderHook(() => useWebRTC(MOCK_CONSULTATION_ID, MOCK_SECURITY_CONTEXT));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Simulate disconnection
    const disconnectHandler = mockRoom.on.mock.calls.find(
      call => call[0] === 'disconnected'
    )?.[1];

    act(() => {
      disconnectHandler?.();
    });

    expect(virtualCareApi.joinConsultation).toHaveBeenCalledTimes(2);
  });

  it('should handle media control operations securely', async () => {
    const { result } = renderHook(() => useWebRTC(MOCK_CONSULTATION_ID, MOCK_SECURITY_CONTEXT));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Test video toggle
    await act(async () => {
      await result.current.toggleVideo();
    });
    expect(mockLocalTrack.disable).toHaveBeenCalled();

    // Test audio toggle
    await act(async () => {
      await result.current.toggleAudio();
    });
    expect(mockLocalTrack.disable).toHaveBeenCalled();
  });

  it('should handle screen sharing with security verification', async () => {
    const { result } = renderHook(() => useWebRTC(MOCK_CONSULTATION_ID, MOCK_SECURITY_CONTEXT));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.shareScreen();
    });

    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled();
    expect(mockRoom.localParticipant.publishTrack).toHaveBeenCalled();
  });

  it('should clean up resources and disconnect securely', async () => {
    const { result, unmount } = renderHook(() => useWebRTC(MOCK_CONSULTATION_ID, MOCK_SECURITY_CONTEXT));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      unmount();
    });

    expect(mockRoom.disconnect).toHaveBeenCalled();
    expect(virtualCareApi.endConsultation).toHaveBeenCalledWith(MOCK_CONSULTATION_ID);
  });

  it('should handle participant events securely', async () => {
    const { result } = renderHook(() => useWebRTC(MOCK_CONSULTATION_ID, MOCK_SECURITY_CONTEXT));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Simulate participant connection
    const connectHandler = mockRoom.on.mock.calls.find(
      call => call[0] === 'participantConnected'
    )?.[1];

    act(() => {
      connectHandler?.(mockRemoteParticipant);
    });

    expect(result.current.remoteParticipants.size).toBe(1);
    expect(result.current.remoteParticipants.get(mockRemoteParticipant.sid)).toBe(mockRemoteParticipant);
  });
});
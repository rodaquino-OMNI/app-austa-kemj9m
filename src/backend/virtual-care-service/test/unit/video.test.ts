/**
 * @fileoverview Unit tests for VideoService with HIPAA compliance and quality monitoring
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { mock, MockProxy } from 'jest-mock-extended'; // @version 3.0.4
import { Model } from 'mongoose'; // @version 7.5.0
import { Room, LocalTrack, RemoteTrack } from 'twilio-video'; // @version 2.27.0
import { VideoService } from '../../src/services/video.service';
import { ISession, SessionStatus } from '../../src/models/session.model';
import { UserRole } from '../../../shared/interfaces/user.interface';
import { ErrorCode } from '../../../shared/constants/error-codes';
import { webRTCConfig } from '../../src/config/webrtc.config';

describe('VideoService', () => {
  let videoService: VideoService;
  let sessionModelMock: MockProxy<Model<ISession>>;
  let qualityMonitorMock: MockProxy<any>;
  let twilioRoomMock: MockProxy<Room>;

  // Test data constants
  const TEST_SESSION_ID = 'test-session-123';
  const TEST_PATIENT_ID = 'patient-123';
  const TEST_PROVIDER_ID = 'provider-456';
  const TEST_ROOM_SID = 'room-789';

  const mockSessionData = {
    patientId: TEST_PATIENT_ID,
    providerId: TEST_PROVIDER_ID,
    scheduledStartTime: new Date(),
    metadata: {
      consultationType: 'ROUTINE',
      priority: 'NORMAL',
      notes: 'Test consultation',
      tags: ['test']
    }
  };

  beforeEach(() => {
    // Initialize mocks
    sessionModelMock = mock<Model<ISession>>();
    qualityMonitorMock = mock<any>();
    twilioRoomMock = mock<Room>();

    // Setup VideoService with mocks
    videoService = new VideoService(sessionModelMock, qualityMonitorMock);
  });

  describe('HIPAA Compliance', () => {
    it('should enforce end-to-end encryption during session initialization', async () => {
      // Setup
      sessionModelMock.create.mockResolvedValueOnce({
        id: TEST_SESSION_ID,
        twilioRoomSid: TEST_ROOM_SID,
        hipaaCompliance: {
          encryptionVerified: true,
          dataPrivacyChecks: true,
          consentObtained: false,
          auditLogComplete: false,
          complianceVersion: '1.0'
        }
      } as any);

      // Execute
      const session = await videoService.initializeSession(mockSessionData);

      // Assert
      expect(session.hipaaCompliance.encryptionVerified).toBe(true);
      expect(session.hipaaCompliance.dataPrivacyChecks).toBe(true);
      expect(sessionModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          securityContext: expect.objectContaining({
            encryptionEnabled: true,
            dtlsRole: 'auto'
          })
        })
      );
    });

    it('should validate participant authentication before joining session', async () => {
      // Setup
      const mockToken = 'valid-jwt-token';
      sessionModelMock.findById.mockResolvedValueOnce({
        id: TEST_SESSION_ID,
        status: SessionStatus.SCHEDULED
      } as any);

      // Execute & Assert
      await expect(videoService.joinSession(
        TEST_SESSION_ID,
        TEST_PROVIDER_ID,
        UserRole.PROVIDER,
        mockToken
      )).resolves.not.toThrow();

      expect(sessionModelMock.findById).toHaveBeenCalledWith(TEST_SESSION_ID);
    });

    it('should maintain comprehensive audit logs for session activities', async () => {
      // Setup
      const mockAuditEvent = {
        action: 'SESSION_START',
        userId: TEST_PROVIDER_ID,
        details: 'Session initiated'
      };

      // Execute
      await videoService.logAuditEvent(TEST_SESSION_ID, mockAuditEvent);

      // Assert
      expect(sessionModelMock.findByIdAndUpdate).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        {
          $push: {
            auditLog: expect.objectContaining({
              timestamp: expect.any(Date),
              ...mockAuditEvent
            })
          }
        }
      );
    });
  });

  describe('Performance Monitoring', () => {
    it('should track real-time network metrics', async () => {
      // Setup
      const mockMetrics = {
        bitrate: 2000,
        packetLoss: 0.5,
        latency: 100,
        jitter: 15,
        resolution: '1280x720',
        frameRate: 30,
        audioLevel: 0.8
      };

      twilioRoomMock.getStats.mockResolvedValueOnce(mockMetrics);

      // Execute
      const metrics = await videoService.monitorSessionQuality(TEST_SESSION_ID);

      // Assert
      expect(metrics).toEqual(expect.objectContaining({
        bitrate: expect.any(Number),
        packetLoss: expect.any(Number),
        latency: expect.any(Number)
      }));
      expect(metrics.latency).toBeLessThan(webRTCConfig.networkConfig.maxLatencyMs);
    });

    it('should detect and handle quality degradation', async () => {
      // Setup
      const poorMetrics = {
        bitrate: 100, // Below minimum threshold
        packetLoss: 5, // Above maximum threshold
        latency: 1000
      };

      // Execute
      await videoService.handleQualityAlerts(TEST_SESSION_ID, poorMetrics);

      // Assert
      expect(qualityMonitorMock.triggerAlert).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        metrics: poorMetrics,
        severity: 'HIGH',
        message: expect.any(String)
      });
    });

    it('should validate response time SLAs', async () => {
      // Setup
      const startTime = Date.now();
      sessionModelMock.findById.mockResolvedValueOnce({
        id: TEST_SESSION_ID,
        status: SessionStatus.IN_PROGRESS
      } as any);

      // Execute
      await videoService.getSessionStatus(TEST_SESSION_ID);
      const responseTime = Date.now() - startTime;

      // Assert
      expect(responseTime).toBeLessThan(500); // 500ms SLA requirement
    });
  });

  describe('WebRTC Configuration', () => {
    it('should apply correct video constraints', async () => {
      // Setup
      const { videoConstraints } = webRTCConfig;

      // Execute & Assert
      expect(videoConstraints).toEqual(
        expect.objectContaining({
          video: {
            width: expect.any(Object),
            height: expect.any(Object),
            frameRate: expect.any(Object)
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        })
      );
    });

    it('should handle connection failures gracefully', async () => {
      // Setup
      twilioRoomMock.disconnect.mockRejectedValueOnce(new Error('Network error'));

      // Execute & Assert
      await expect(videoService.endSession(TEST_SESSION_ID))
        .rejects.toThrow(ErrorCode.NETWORK_ERROR);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session IDs', async () => {
      // Setup
      sessionModelMock.findById.mockResolvedValueOnce(null);

      // Execute & Assert
      await expect(videoService.getSessionStatus('invalid-id'))
        .rejects.toThrow(ErrorCode.RESOURCE_NOT_FOUND);
    });

    it('should prevent unauthorized access attempts', async () => {
      // Setup
      const invalidToken = 'invalid-token';

      // Execute & Assert
      await expect(videoService.joinSession(
        TEST_SESSION_ID,
        'unauthorized-user',
        UserRole.PATIENT,
        invalidToken
      )).rejects.toThrow(ErrorCode.UNAUTHORIZED);
    });
  });
});
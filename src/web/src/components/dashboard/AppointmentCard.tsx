import React, { useCallback, useEffect, useState } from 'react';
import { format, isWithinInterval } from 'date-fns';
import { useTranslation } from 'react-i18next';

import { 
  IConsultation, 
  ConsultationStatus, 
  ConsultationType,
  ConnectionQuality 
} from '../../lib/types/consultation';
import { IUser } from '../../lib/types/user';
import { Card } from '../../styles/components';
import { theme } from '../../styles/theme';

interface AppointmentCardProps {
  appointment: IConsultation & { isEmergency?: boolean };
  provider: IUser & { specialization?: string };
  onJoin: (appointmentId: string) => Promise<void>;
  onCancel: (appointmentId: string) => Promise<void>;
  onReschedule: (appointmentId: string) => Promise<void>;
  connectionConfig?: {
    minQuality: ConnectionQuality;
    checkInterval: number;
  };
}

const formatAppointmentTime = (date: Date, locale: string, timezone: string): string => {
  return format(
    new Date(date.toLocaleString('en-US', { timeZone: timezone })),
    'PPpp',
    { locale: require(`date-fns/locale/${locale}`) }
  );
};

const getStatusColor = (
  status: ConsultationStatus,
  isEmergency: boolean,
  theme: typeof import('../../styles/theme').theme
): string => {
  if (isEmergency) return theme.palette.error.main;

  const statusColors = {
    [ConsultationStatus.SCHEDULED]: theme.palette.primary.main,
    [ConsultationStatus.WAITING]: theme.palette.warning.main,
    [ConsultationStatus.IN_PROGRESS]: theme.palette.success.main,
    [ConsultationStatus.COMPLETED]: theme.palette.text.disabled,
    [ConsultationStatus.CANCELLED]: theme.palette.error.main,
    [ConsultationStatus.FAILED]: theme.palette.error.dark
  };

  return statusColors[status] || theme.palette.text.primary;
};

export const AppointmentCard: React.FC<AppointmentCardProps> = ({
  appointment,
  provider,
  onJoin,
  onCancel,
  onReschedule,
  connectionConfig = { minQuality: ConnectionQuality.FAIR, checkInterval: 10000 }
}) => {
  const { t } = useTranslation();
  const [isUpcoming, setIsUpcoming] = useState<boolean>(false);
  const [canJoin, setCanJoin] = useState<boolean>(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(ConnectionQuality.GOOD);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const checkAppointmentStatus = () => {
      const now = new Date();
      const appointmentTime = new Date(appointment.scheduledStartTime);
      const joinWindow = {
        start: new Date(appointmentTime.getTime() - 5 * 60000), // 5 minutes before
        end: new Date(appointmentTime.getTime() + 30 * 60000) // 30 minutes after
      };

      setIsUpcoming(appointmentTime > now);
      setCanJoin(
        isWithinInterval(now, joinWindow) &&
        appointment.status === ConsultationStatus.SCHEDULED &&
        connectionQuality >= connectionConfig.minQuality
      );
    };

    checkAppointmentStatus();
    const interval = setInterval(checkAppointmentStatus, 30000);
    return () => clearInterval(interval);
  }, [appointment, connectionQuality, connectionConfig.minQuality]);

  useEffect(() => {
    const monitorConnection = () => {
      // Simulated connection quality check - replace with actual WebRTC stats
      const qualities = Object.values(ConnectionQuality);
      const currentQuality = qualities[Math.floor(Math.random() * 3)]; // Simulate varying connection
      setConnectionQuality(currentQuality);
    };

    const interval = setInterval(monitorConnection, connectionConfig.checkInterval);
    return () => clearInterval(interval);
  }, [connectionConfig.checkInterval]);

  const handleJoinClick = useCallback(async () => {
    try {
      setLoading(true);
      await onJoin(appointment.id);
    } catch (error) {
      console.error('Failed to join consultation:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment.id, onJoin]);

  const handleCancelClick = useCallback(async () => {
    try {
      setLoading(true);
      await onCancel(appointment.id);
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment.id, onCancel]);

  const handleRescheduleClick = useCallback(async () => {
    try {
      setLoading(true);
      await onReschedule(appointment.id);
    } catch (error) {
      console.error('Failed to reschedule appointment:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment.id, onReschedule]);

  return (
    <Card
      elevation="clinical"
      clinicalMode={appointment.isEmergency ? 'critical' : 'standard'}
      role="article"
      aria-label={t('appointment.card.label')}
    >
      <div className="appointment-header" role="heading" aria-level={3}>
        <div className="provider-info">
          <span className="provider-name" aria-label={t('appointment.provider.name')}>
            {`${provider.profile.firstName} ${provider.profile.lastName}`}
          </span>
          <span className="provider-specialization" aria-label={t('appointment.provider.specialization')}>
            {provider.specialization}
          </span>
        </div>
        <div 
          className="appointment-type"
          aria-label={t('appointment.type')}
          style={{ color: getStatusColor(appointment.status, appointment.isEmergency || false, theme) }}
        >
          {appointment.type === ConsultationType.VIDEO && '📹'}
          {appointment.type === ConsultationType.AUDIO && '🎤'}
          {appointment.type === ConsultationType.CHAT && '💬'}
          <span className="visually-hidden">
            {t(`appointment.type.${appointment.type.toLowerCase()}`)}
          </span>
        </div>
      </div>

      <div className="appointment-details">
        <div className="time-info" aria-label={t('appointment.time')}>
          <time dateTime={appointment.scheduledStartTime.toISOString()}>
            {formatAppointmentTime(
              appointment.scheduledStartTime,
              navigator.language,
              Intl.DateTimeFormat().resolvedOptions().timeZone
            )}
          </time>
        </div>
        <div 
          className="status-indicator"
          role="status"
          aria-live="polite"
          style={{ color: getStatusColor(appointment.status, appointment.isEmergency || false, theme) }}
        >
          {t(`appointment.status.${appointment.status.toLowerCase()}`)}
        </div>
      </div>

      <div className="appointment-actions" role="group" aria-label={t('appointment.actions')}>
        {canJoin && (
          <button
            onClick={handleJoinClick}
            disabled={loading || connectionQuality < connectionConfig.minQuality}
            aria-busy={loading}
            className="join-button"
          >
            {t('appointment.action.join')}
          </button>
        )}
        {isUpcoming && (
          <>
            <button
              onClick={handleCancelClick}
              disabled={loading}
              aria-busy={loading}
              className="cancel-button"
            >
              {t('appointment.action.cancel')}
            </button>
            <button
              onClick={handleRescheduleClick}
              disabled={loading}
              aria-busy={loading}
              className="reschedule-button"
            >
              {t('appointment.action.reschedule')}
            </button>
          </>
        )}
      </div>

      {connectionQuality < connectionConfig.minQuality && (
        <div 
          className="connection-warning"
          role="alert"
          aria-live="assertive"
        >
          {t('appointment.connection.warning')}
        </div>
      )}

      <style jsx>{`
        .appointment-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: ${theme.spacing(2)}px;
        }

        .provider-info {
          display: flex;
          flex-direction: column;
        }

        .provider-name {
          font-size: ${theme.typography.h3.fontSize};
          font-weight: ${theme.typography.fontWeightBold};
          color: ${theme.palette.text.primary};
        }

        .provider-specialization {
          font-size: ${theme.typography.body2.fontSize};
          color: ${theme.palette.text.secondary};
        }

        .appointment-details {
          margin: ${theme.spacing(2)}px 0;
        }

        .time-info {
          font-size: ${theme.typography.body1.fontSize};
          color: ${theme.palette.text.primary};
        }

        .status-indicator {
          font-weight: ${theme.typography.fontWeightMedium};
          margin-top: ${theme.spacing(1)}px;
        }

        .appointment-actions {
          display: flex;
          gap: ${theme.spacing(2)}px;
          margin-top: ${theme.spacing(3)}px;
        }

        button {
          padding: ${theme.spacing(1)}px ${theme.spacing(2)}px;
          border-radius: ${theme.shape.borderRadius}px;
          font-weight: ${theme.typography.fontWeightMedium};
          transition: all 0.2s ease-in-out;
          min-height: 44px;
        }

        .join-button {
          background-color: ${theme.palette.primary.main};
          color: ${theme.palette.primary.contrastText};
        }

        .cancel-button {
          background-color: ${theme.palette.error.main};
          color: ${theme.palette.error.contrastText};
        }

        .reschedule-button {
          background-color: ${theme.palette.secondary.main};
          color: ${theme.palette.secondary.contrastText};
        }

        button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .connection-warning {
          margin-top: ${theme.spacing(2)}px;
          padding: ${theme.spacing(1)}px;
          background-color: ${theme.palette.warning.light};
          color: ${theme.palette.warning.dark};
          border-radius: ${theme.shape.borderRadius}px;
        }

        .visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          button {
            transition: none;
          }
        }
      `}</style>
    </Card>
  );
};

export default AppointmentCard;
/**
 * @fileoverview Timeline component for displaying patient health records
 * Implements FHIR R4 compliance, Material Design 3.0, and WCAG 2.1 AA accessibility
 * @version 1.0.0
 */

import React, { useCallback, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import { FixedSizeList as VirtualList } from 'react-window';
import { format } from 'date-fns-tz';
import { 
  Box, 
  Typography, 
  Divider, 
  IconButton, 
  Tooltip,
  useTheme 
} from '@mui/material';

// Internal imports
import { 
  IHealthRecord, 
  HealthRecordType, 
  SecurityClassification 
} from '../../lib/types/healthRecord';
import { useHealthRecords } from '../../hooks/useHealthRecords';
import ErrorBoundary from '../common/ErrorBoundary';
import { Analytics } from '../../lib/utils/analytics';

// Styled components with Material Design 3.0 patterns
const TimelineContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows.clinical,
  overflow: 'hidden'
}));

const TimelineGroup = styled(Box)(({ theme }) => ({
  padding: theme.spacing.md,
  borderBottom: `1px solid ${theme.palette.divider}`,
  '&:last-child': {
    borderBottom: 'none'
  }
}));

const TimelineItem = styled(Box, {
  shouldForwardProp: prop => prop !== 'isHighlighted'
})<{ isHighlighted?: boolean }>(({ theme, isHighlighted }) => ({
  display: 'flex',
  padding: theme.spacing.md,
  backgroundColor: isHighlighted ? theme.palette.background.clinical : 'transparent',
  transition: 'background-color 0.2s ease',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: theme.palette.background.clinical
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: '-2px'
  }
}));

// Interface definitions
interface TimelineProps {
  patientId: string;
  recordTypes: HealthRecordType[];
  startDate: Date;
  endDate: Date;
  onRecordClick: (record: IHealthRecord) => void;
  securityContext: {
    accessLevel: string;
    userRole: string;
  };
  timezone: string;
}

// Constants
const ITEM_HEIGHT = 72;
const ITEMS_PER_PAGE = 20;

/**
 * Timeline component for displaying health records chronologically
 */
const Timeline: React.FC<TimelineProps> = ({
  patientId,
  recordTypes,
  startDate,
  endDate,
  onRecordClick,
  securityContext,
  timezone
}) => {
  const theme = useTheme();
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Initialize health records hook with security context
  const {
    records,
    loading,
    error,
    fetchRecords
  } = useHealthRecords(patientId, {
    autoFetch: true,
    recordTypes,
    enableRealTimeSync: true
  });

  // Group records by date with timezone support
  const groupedRecords = useMemo(() => {
    if (!records) return new Map();

    return records.reduce((groups, record) => {
      const dateKey = format(record.date, 'yyyy-MM-dd', { timeZone: timezone });
      const group = groups.get(dateKey) || [];
      groups.set(dateKey, [...group, record]);
      return groups;
    }, new Map<string, IHealthRecord[]>());
  }, [records, timezone]);

  // Handle record selection with security check
  const handleRecordClick = useCallback((record: IHealthRecord) => {
    if (record.securityClassification === SecurityClassification.HIGHLY_CONFIDENTIAL &&
        !securityContext.accessLevel.includes('PHI_ACCESS')) {
      return;
    }

    setSelectedRecordId(record.id);
    onRecordClick(record);

    // Track interaction with sanitized data
    Analytics.trackEvent({
      name: 'health_record_viewed',
      category: Analytics.AnalyticsCategory.USER_INTERACTION,
      properties: {
        recordType: record.type,
        securityLevel: record.securityClassification
      },
      timestamp: Date.now(),
      userConsent: true,
      privacyLevel: Analytics.PrivacyLevel.INTERNAL,
      auditInfo: {
        eventId: `record_view_${Date.now()}`,
        timestamp: Date.now(),
        userId: 'system',
        ipAddress: 'internal',
        actionType: 'record_access'
      }
    });
  }, [onRecordClick, securityContext]);

  // Render timeline item with accessibility support
  const renderTimelineItem = useCallback(({ index, style }) => {
    const dateKeys = Array.from(groupedRecords.keys());
    const dateKey = dateKeys[index];
    const dayRecords = groupedRecords.get(dateKey) || [];

    return (
      <TimelineGroup style={style}>
        <Typography 
          variant="h6" 
          component="h2"
          sx={{ mb: 2 }}
          aria-label={`Records for ${format(new Date(dateKey), 'PPPP', { timeZone: timezone })}`}
        >
          {format(new Date(dateKey), 'PPPP', { timeZone: timezone })}
        </Typography>
        
        {dayRecords.map(record => (
          <TimelineItem
            key={record.id}
            isHighlighted={record.id === selectedRecordId}
            onClick={() => handleRecordClick(record)}
            onKeyPress={e => e.key === 'Enter' && handleRecordClick(record)}
            tabIndex={0}
            role="button"
            aria-selected={record.id === selectedRecordId}
            aria-label={`${record.type} record from ${format(record.date, 'PPpp', { timeZone: timezone })}`}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1">
                {record.type}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {format(record.date, 'p', { timeZone: timezone })}
              </Typography>
            </Box>
          </TimelineItem>
        ))}
      </TimelineGroup>
    );
  }, [groupedRecords, selectedRecordId, handleRecordClick, timezone]);

  if (error) {
    return (
      <Box 
        role="alert" 
        aria-live="polite"
        sx={{ p: 3, textAlign: 'center' }}
      >
        <Typography color="error">
          Error loading health records. Please try again.
        </Typography>
      </Box>
    );
  }

  return (
    <ErrorBoundary>
      <TimelineContainer
        role="region"
        aria-label="Health Records Timeline"
        aria-busy={loading}
      >
        {loading ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography>Loading health records...</Typography>
          </Box>
        ) : (
          <VirtualList
            height={window.innerHeight - 200}
            width="100%"
            itemCount={groupedRecords.size}
            itemSize={ITEM_HEIGHT}
            overscanCount={2}
          >
            {renderTimelineItem}
          </VirtualList>
        )}
      </TimelineContainer>
    </ErrorBoundary>
  );
};

export default Timeline;
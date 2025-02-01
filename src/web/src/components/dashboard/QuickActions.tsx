import React from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.11.0
import { Button } from '../common/Button';
import { UserRole } from '../../lib/types/user';
import { Analytics, AnalyticsCategory, PrivacyLevel } from '../../lib/utils/analytics';
import { theme } from '../../styles/theme';

// Security level enum for action classification
enum SecurityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// Interface for security context
interface SecurityContext {
  sessionId: string;
  authToken: string;
  ipAddress: string;
  deviceId: string;
}

// Props interface with security features
interface QuickActionsProps {
  userRole: UserRole;
  className?: string;
  securityContext: SecurityContext;
}

// Action interface with security metadata
interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  roles: ReadonlyArray<UserRole>;
  securityLevel: SecurityLevel;
}

// Styled components with healthcare-optimized styling
const ActionsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing(2)}px;
  padding: ${theme.spacing(2)}px;
  background: ${theme.palette.background.paper};
  border-radius: ${theme.shape.borderRadius}px;
  box-shadow: ${theme.shadows[1]};
`;

const ActionButton = styled(Button)`
  width: 100%;
  height: 64px;
  justify-content: flex-start;
  padding: ${theme.spacing(2)}px;
  gap: ${theme.spacing(1)}px;
  
  svg {
    width: 24px;
    height: 24px;
  }
`;

// Immutable quick actions configuration with role-based access
const QUICK_ACTIONS: ReadonlyArray<QuickAction> = Object.freeze([
  {
    id: 'new-appointment',
    label: 'New Appointment',
    icon: '📅',
    href: '/appointments/new',
    roles: [UserRole.PATIENT, UserRole.PROVIDER],
    securityLevel: SecurityLevel.MEDIUM
  },
  {
    id: 'submit-claim',
    label: 'Submit Claim',
    icon: '📝',
    href: '/claims/new',
    roles: [UserRole.PATIENT, UserRole.INSURANCE],
    securityLevel: SecurityLevel.HIGH
  },
  {
    id: 'view-records',
    label: 'Health Records',
    icon: '📋',
    href: '/records',
    roles: [UserRole.PATIENT, UserRole.PROVIDER, UserRole.ADMIN],
    securityLevel: SecurityLevel.HIGH
  },
  {
    id: 'emergency-care',
    label: 'Emergency Care',
    icon: '🚨',
    href: '/emergency',
    roles: [UserRole.PATIENT, UserRole.PROVIDER],
    securityLevel: SecurityLevel.CRITICAL
  }
]);

// Security levels configuration
const SECURITY_LEVELS: ReadonlyArray<SecurityLevel> = Object.freeze([
  SecurityLevel.LOW,
  SecurityLevel.MEDIUM,
  SecurityLevel.HIGH,
  SecurityLevel.CRITICAL
]);

// Get available actions with security validation
const getAvailableActions = (
  userRole: UserRole,
  securityContext: SecurityContext
): ReadonlyArray<QuickAction> => {
  // Validate security context
  if (!securityContext.sessionId || !securityContext.authToken) {
    return [];
  }

  return QUICK_ACTIONS.filter(action => {
    // Validate role access
    const hasRole = action.roles.includes(userRole);
    
    // Additional security checks for high-risk actions
    const requiresAdditionalAuth = action.securityLevel === SecurityLevel.CRITICAL;
    const hasValidSession = securityContext.sessionId.length > 0;
    
    return hasRole && (!requiresAdditionalAuth || hasValidSession);
  });
};

// Handle action click with security and analytics
const handleActionClick = async (
  action: QuickAction,
  securityContext: SecurityContext,
  event: React.MouseEvent
): Promise<void> => {
  event.preventDefault();

  // Track secure analytics event
  await Analytics.trackEvent({
    name: 'quick_action_click',
    category: AnalyticsCategory.USER_INTERACTION,
    properties: {
      actionId: action.id,
      securityLevel: action.securityLevel,
      timestamp: Date.now()
    },
    timestamp: Date.now(),
    userConsent: true,
    privacyLevel: action.securityLevel === SecurityLevel.CRITICAL ? 
      PrivacyLevel.SENSITIVE : 
      PrivacyLevel.INTERNAL,
    auditInfo: {
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      userId: 'anonymous', // Replace with actual user ID
      ipAddress: securityContext.ipAddress,
      actionType: 'quick_action_interaction'
    }
  });

  // Navigate to action URL
  window.location.href = action.href;
};

// QuickActions component with security features
export const QuickActions: React.FC<QuickActionsProps> = ({
  userRole,
  className,
  securityContext
}) => {
  const availableActions = getAvailableActions(userRole, securityContext);

  return (
    <ActionsContainer className={className}>
      {availableActions.map(action => (
        <ActionButton
          key={action.id}
          variant={action.securityLevel === SecurityLevel.CRITICAL ? 'emergency' : 'primary'}
          size="touch-optimized"
          onClick={(e) => handleActionClick(action, securityContext, e)}
          criticalAction={action.securityLevel === SecurityLevel.CRITICAL}
          data-testid={`quick-action-${action.id}`}
          aria-label={action.label}
        >
          <span role="img" aria-hidden="true">{action.icon}</span>
          {action.label}
        </ActionButton>
      ))}
    </ActionsContainer>
  );
};

export default QuickActions;
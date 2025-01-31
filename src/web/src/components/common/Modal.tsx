import React, { useEffect, useCallback } from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.11.0
import FocusTrap from 'focus-trap-react'; // ^10.0.0
import { Portal } from '@mui/base'; // ^5.0.0
import { theme } from '../../styles/theme';
import Button from './Button';
import { Analytics } from '../../lib/utils/analytics';

// Clinical action interface
interface ClinicalAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'emergency';
  requiresConfirmation?: boolean;
}

// Modal props interface with clinical considerations
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  clinicalContext?: 'standard' | 'emergency' | 'critical';
  actions?: ClinicalAction[];
  accessibilityMode?: 'standard' | 'medical-device';
}

// Modal size configurations
const MODAL_SIZES = {
  small: {
    width: '400px',
    maxHeight: '70vh',
  },
  medium: {
    width: '600px',
    maxHeight: '80vh',
  },
  large: {
    width: '800px',
    maxHeight: '90vh',
  },
};

// Clinical context styles
const CLINICAL_CONTEXTS = {
  standard: {
    borderColor: theme.palette.clinical.main,
    backgroundColor: theme.palette.background.clinical,
    headerColor: theme.palette.primary.main,
  },
  emergency: {
    borderColor: theme.palette.error.main,
    backgroundColor: theme.palette.error.light + '10',
    headerColor: theme.palette.error.main,
  },
  critical: {
    borderColor: theme.palette.error.dark,
    backgroundColor: theme.palette.error.light + '20',
    headerColor: theme.palette.error.dark,
  },
};

// Styled components with clinical optimizations
const StyledOverlay = styled.div<{ clinicalContext: string }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${({ clinicalContext }) =>
    clinicalContext === 'emergency' || clinicalContext === 'critical'
      ? 'rgba(0, 0, 0, 0.75)'
      : 'rgba(0, 0, 0, 0.5)'};
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`;

const StyledModal = styled.div<{
  size: keyof typeof MODAL_SIZES;
  clinicalContext: string;
  accessibilityMode: string;
}>`
  background: ${({ clinicalContext }) =>
    CLINICAL_CONTEXTS[clinicalContext as keyof typeof CLINICAL_CONTEXTS].backgroundColor};
  border: 2px solid ${({ clinicalContext }) =>
    CLINICAL_CONTEXTS[clinicalContext as keyof typeof CLINICAL_CONTEXTS].borderColor};
  border-radius: ${theme.shape.borderRadiusLarge}px;
  box-shadow: ${theme.shadows.modal};
  width: ${({ size }) => MODAL_SIZES[size].width};
  max-height: ${({ size }) => MODAL_SIZES[size].maxHeight};
  max-width: 95vw;
  display: flex;
  flex-direction: column;
  position: relative;
  animation: modalEnter 0.3s ease-out;

  ${({ accessibilityMode }) =>
    accessibilityMode === 'medical-device' &&
    `
    border-width: 3px;
    * {
      min-height: 44px;
      min-width: 44px;
    }
  `}

  @keyframes modalEnter {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`;

const ModalHeader = styled.div<{ clinicalContext: string }>`
  padding: ${theme.spacing.lg}px;
  border-bottom: 1px solid ${({ clinicalContext }) =>
    CLINICAL_CONTEXTS[clinicalContext as keyof typeof CLINICAL_CONTEXTS].borderColor};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h2<{ clinicalContext: string }>`
  margin: 0;
  color: ${({ clinicalContext }) =>
    CLINICAL_CONTEXTS[clinicalContext as keyof typeof CLINICAL_CONTEXTS].headerColor};
  font-size: ${theme.typography.h3.fontSize};
  font-weight: ${theme.typography.fontWeightBold};
`;

const Content = styled.div`
  padding: ${theme.spacing.lg}px;
  overflow-y: auto;
  flex: 1;
  -webkit-overflow-scrolling: touch;
`;

const Actions = styled.div`
  padding: ${theme.spacing.lg}px;
  border-top: 1px solid ${theme.palette.divider};
  display: flex;
  justify-content: flex-end;
  gap: ${theme.spacing.md}px;
`;

// Clinical action handler with safety checks
const handleClinicalAction = async (
  action: ClinicalAction,
  clinicalContext: string
): Promise<void> => {
  if (action.requiresConfirmation) {
    const confirmed = window.confirm('Please confirm this clinical action');
    if (!confirmed) return;
  }

  try {
    await Analytics.trackEvent({
      name: 'modal_action_click',
      category: Analytics.AnalyticsCategory.USER_INTERACTION,
      properties: {
        actionLabel: action.label,
        clinicalContext,
        requiresConfirmation: action.requiresConfirmation,
      },
      timestamp: Date.now(),
      userConsent: true,
      privacyLevel: clinicalContext === 'emergency' || clinicalContext === 'critical'
        ? Analytics.PrivacyLevel.SENSITIVE
        : Analytics.PrivacyLevel.INTERNAL,
      auditInfo: {
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        userId: 'anonymous',
        ipAddress: 'masked',
        actionType: 'modal_interaction'
      }
    });

    action.onClick();
  } catch (error) {
    console.error('Clinical action failed:', error);
    throw new Error('Clinical action failed');
  }
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  clinicalContext = 'standard',
  actions = [],
  accessibilityMode = 'standard',
}) => {
  const handleEscape = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && clinicalContext !== 'critical') {
      onClose();
    }
  }, [clinicalContext, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <Portal>
      <FocusTrap>
        <StyledOverlay
          clinicalContext={clinicalContext}
          onClick={(e) => e.target === e.currentTarget && clinicalContext !== 'critical' && onClose()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <StyledModal
            size={size}
            clinicalContext={clinicalContext}
            accessibilityMode={accessibilityMode}
          >
            <ModalHeader clinicalContext={clinicalContext}>
              <Title id="modal-title" clinicalContext={clinicalContext}>
                {title}
              </Title>
              {clinicalContext !== 'critical' && (
                <Button
                  variant="tertiary"
                  size="small"
                  onClick={onClose}
                  aria-label="Close modal"
                >
                  ✕
                </Button>
              )}
            </ModalHeader>
            <Content role="document">{children}</Content>
            {actions.length > 0 && (
              <Actions>
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    variant={action.variant || 'primary'}
                    onClick={() => handleClinicalAction(action, clinicalContext)}
                    criticalAction={clinicalContext === 'critical'}
                    highContrast={accessibilityMode === 'medical-device'}
                  >
                    {action.label}
                  </Button>
                ))}
              </Actions>
            )}
          </StyledModal>
        </StyledOverlay>
      </FocusTrap>
    </Portal>
  );
};

export default Modal;
import React from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.11.0
import { theme } from '../../styles/theme';
import { Analytics, AnalyticsCategory, PrivacyLevel } from '../../lib/utils/analytics';

// Button size configurations with clinical touch targets
const BUTTON_SIZES = {
  small: {
    padding: '8px 16px',
    fontSize: '14px',
    height: '32px',
    touchTarget: '44px'
  },
  medium: {
    padding: '12px 24px',
    fontSize: '16px',
    height: '40px',
    touchTarget: '48px'
  },
  large: {
    padding: '16px 32px',
    fontSize: '18px',
    height: '48px',
    touchTarget: '56px'
  },
  'touch-optimized': {
    padding: '20px 40px',
    fontSize: '20px',
    height: '64px',
    touchTarget: '64px'
  }
} as const;

// Button component props interface
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'emergency';
  size?: 'small' | 'medium' | 'large' | 'touch-optimized';
  disabled?: boolean;
  fullWidth?: boolean;
  highContrast?: boolean;
  criticalAction?: boolean;
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

// Styled button component with clinical optimizations
const StyledButton = styled.button<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  font-family: ${theme.typography.fontFamily};
  transition: all 0.2s ease-in-out;
  position: relative;
  width: ${props => props.fullWidth ? '100%' : 'auto'};
  white-space: nowrap;
  outline: none;
  
  /* Size styles with clinical touch targets */
  ${props => {
    const size = BUTTON_SIZES[props.size || 'medium'];
    return `
      padding: ${size.padding};
      font-size: ${size.fontSize};
      height: ${size.height};
      min-width: ${size.touchTarget};
    `;
  }}

  /* Variant styles with clinical considerations */
  ${props => {
    const colors = theme.palette;
    switch (props.variant) {
      case 'primary':
        return `
          background: ${colors.primary.main};
          color: ${colors.primary.contrastText};
          &:hover:not(:disabled) {
            background: ${colors.primary.dark};
          }
          &:active:not(:disabled) {
            transform: translateY(1px);
          }
        `;
      case 'secondary':
        return `
          background: ${colors.secondary.main};
          color: ${colors.secondary.contrastText};
          &:hover:not(:disabled) {
            background: ${colors.secondary.dark};
          }
          &:active:not(:disabled) {
            transform: translateY(1px);
          }
        `;
      case 'emergency':
        return `
          background: ${colors.error.main};
          color: ${colors.error.contrastText};
          &:hover:not(:disabled) {
            background: ${colors.error.dark};
          }
          &:active:not(:disabled) {
            transform: translateY(1px);
          }
          animation: ${props.criticalAction ? 'pulse 2s infinite' : 'none'};
        `;
      case 'tertiary':
      default:
        return `
          background: transparent;
          color: ${colors.primary.main};
          border: 2px solid ${colors.primary.main};
          &:hover:not(:disabled) {
            background: ${colors.primary.main}10;
          }
          &:active:not(:disabled) {
            transform: translateY(1px);
          }
        `;
    }
  }}

  /* High contrast mode for clinical settings */
  ${props => props.highContrast && `
    border: 2px solid ${theme.palette.text.primary};
    font-weight: ${theme.typography.fontWeightBold};
    text-shadow: 0 0 1px rgba(0, 0, 0, 0.5);
  `}

  /* Disabled state with clinical considerations */
  &:disabled {
    opacity: 0.6;
    background: ${theme.palette.text.disabled};
    color: ${theme.palette.background.paper};
    border: none;
  }

  /* Focus state for accessibility */
  &:focus-visible {
    outline: 3px solid ${theme.palette.primary.main};
    outline-offset: 2px;
  }

  /* Critical action pulse animation */
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(211, 47, 47, 0.4);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(211, 47, 47, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(211, 47, 47, 0);
    }
  }

  /* Touch feedback for clinical environment */
  &::after {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:active::after {
    opacity: 0.1;
  }
`;

// Click handler with HIPAA-compliant analytics
const handleClick = (
  event: React.MouseEvent<HTMLButtonElement>,
  props: ButtonProps
) => {
  if (props.disabled) {
    event.preventDefault();
    return;
  }

  // Track HIPAA-compliant interaction
  Analytics.trackEvent({
    name: 'button_click',
    category: AnalyticsCategory.USER_INTERACTION,
    properties: {
      variant: props.variant,
      size: props.size,
      criticalAction: props.criticalAction,
      componentId: props.className
    },
    timestamp: Date.now(),
    userConsent: true,
    privacyLevel: props.criticalAction ? 
      PrivacyLevel.SENSITIVE : 
      PrivacyLevel.PUBLIC,
    auditInfo: {
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      userId: 'anonymous', // Should be replaced with actual user ID
      ipAddress: 'masked',
      actionType: 'button_interaction'
    }
  });

  props.onClick?.(event);
};

// Button component with clinical optimizations
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  disabled = false,
  fullWidth = false,
  highContrast = false,
  criticalAction = false,
  children,
  onClick,
  type = 'button',
  className,
  ...props
}) => {
  return (
    <StyledButton
      variant={variant}
      size={size}
      disabled={disabled}
      fullWidth={fullWidth}
      highContrast={highContrast}
      criticalAction={criticalAction}
      onClick={(e) => handleClick(e, { variant, size, disabled, criticalAction, onClick, className, children })}
      type={type}
      className={className}
      role="button"
      aria-disabled={disabled}
      {...props}
    >
      {children}
    </StyledButton>
  );
};

export default Button;
import styled from '@emotion/styled'; // @emotion/styled ^11.11.0
import { css } from '@emotion/react'; // @emotion/react ^11.11.0
import { theme } from './theme';

// Global constants for medical interface components
const COMPONENT_SIZES = {
  small: {
    padding: '12px 20px',
    fontSize: '16px',
    height: '44px',
    touchTarget: '44px'
  },
  medium: {
    padding: '16px 28px',
    fontSize: '18px',
    height: '48px',
    touchTarget: '48px'
  },
  large: {
    padding: '20px 36px',
    fontSize: '20px',
    height: '56px',
    touchTarget: '56px'
  }
} as const;

const CLINICAL_STATES = {
  standard: {
    contrast: '4.5:1',
    focus: '3px solid'
  },
  critical: {
    contrast: '7:1',
    focus: '4px solid'
  },
  monitoring: {
    contrast: '5:1',
    focus: '3px solid'
  }
} as const;

const TRANSITION_DURATION = '0.2s';

// Helper function for component variants
const getComponentVariant = (
  variant: string,
  component: string,
  isEmergency?: boolean
) => {
  const baseStyles = {
    primary: css`
      background-color: ${theme.palette.primary.main};
      color: ${theme.palette.primary.contrastText};
      &:hover {
        background-color: ${theme.palette.primary.dark};
      }
    `,
    secondary: css`
      background-color: ${theme.palette.secondary.main};
      color: ${theme.palette.secondary.contrastText};
      &:hover {
        background-color: ${theme.palette.secondary.dark};
      }
    `,
    clinical: css`
      background-color: ${theme.palette.clinical.main};
      color: ${theme.palette.clinical.contrastText};
      &:hover {
        background-color: ${theme.palette.clinical.dark};
      }
    `,
    emergency: css`
      background-color: ${theme.palette.error.main};
      color: ${theme.palette.error.contrastText};
      animation: pulse 2s infinite;
      &:hover {
        background-color: ${theme.palette.error.dark};
      }
    `
  };

  return isEmergency ? baseStyles.emergency : baseStyles[variant] || baseStyles.primary;
};

// Enhanced Button Component
export const Button = styled.button<{
  variant?: 'primary' | 'secondary' | 'clinical' | 'emergency';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  isEmergency?: boolean;
  clinicalMode?: 'standard' | 'critical' | 'monitoring';
}>`
  ${({ variant = 'primary', size = 'medium', fullWidth, isEmergency, clinicalMode = 'standard' }) => css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: ${theme.shape.buttonRadius}px;
    cursor: pointer;
    font-family: ${theme.typography.fontFamily};
    font-weight: ${theme.typography.fontWeightMedium};
    transition: all ${TRANSITION_DURATION} ease-in-out;
    min-width: ${COMPONENT_SIZES[size].touchTarget};
    width: ${fullWidth ? '100%' : 'auto'};
    padding: ${COMPONENT_SIZES[size].padding};
    font-size: ${COMPONENT_SIZES[size].fontSize};
    height: ${COMPONENT_SIZES[size].height};

    ${getComponentVariant(variant, 'button', isEmergency)}

    &:focus-visible {
      outline: ${CLINICAL_STATES[clinicalMode].focus} ${theme.palette.primary.main};
      outline-offset: 2px;
    }

    &:disabled {
      background-color: ${theme.palette.text.disabled};
      cursor: not-allowed;
      opacity: 0.7;
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }

    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
  `}
`;

// Medical-optimized Input Component
export const Input = styled.input<{
  error?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  clinicalValidation?: 'none' | 'warning' | 'critical';
  secureContent?: boolean;
  readOnlyMedical?: boolean;
}>`
  ${({ error, disabled, fullWidth, clinicalValidation = 'none', secureContent, readOnlyMedical }) => css`
    width: ${fullWidth ? '100%' : 'auto'};
    padding: ${theme.spacing.md}px;
    font-family: ${theme.typography.fontFamily};
    font-size: ${theme.typography.body1.fontSize};
    line-height: ${theme.typography.body1.lineHeight};
    color: ${theme.palette.text.primary};
    background-color: ${theme.palette.background.paper};
    border: 1px solid ${error ? theme.palette.error.main : theme.palette.text.disabled};
    border-radius: ${theme.shape.borderRadiusSmall}px;
    transition: border-color ${TRANSITION_DURATION} ease-in-out;

    ${clinicalValidation === 'warning' && css`
      border-color: ${theme.palette.warning.main};
      background-color: ${theme.palette.warning.light}10;
    `}

    ${clinicalValidation === 'critical' && css`
      border-color: ${theme.palette.error.main};
      background-color: ${theme.palette.error.light}10;
    `}

    ${secureContent && css`
      -webkit-text-security: disc;
      font-family: text-security-disc;
    `}

    ${readOnlyMedical && css`
      background-color: ${theme.palette.background.clinical};
      border-color: ${theme.palette.clinical.main};
      cursor: default;
    `}

    &:focus {
      outline: none;
      border-color: ${theme.palette.primary.main};
      box-shadow: 0 0 0 3px ${theme.palette.primary.light}30;
    }

    &:disabled {
      background-color: ${theme.palette.background.default};
      cursor: not-allowed;
      opacity: 0.7;
    }

    &::placeholder {
      color: ${theme.palette.text.secondary};
    }
  `}
`;

// Clinical Information Card Component
export const Card = styled.div<{
  elevation?: 'clinical' | 'elevated' | 'modal';
  clinicalMode?: 'standard' | 'critical' | 'monitoring';
  secure?: boolean;
}>`
  ${({ elevation = 'clinical', clinicalMode = 'standard', secure }) => css`
    background-color: ${theme.palette.background.paper};
    border-radius: ${theme.shape.clinicalCard}px;
    padding: ${theme.spacing.lg}px;
    box-shadow: ${theme.shadows[elevation]};
    transition: box-shadow ${TRANSITION_DURATION} ease-in-out;

    ${clinicalMode === 'critical' && css`
      border-left: 4px solid ${theme.palette.error.main};
    `}

    ${clinicalMode === 'monitoring' && css`
      border-left: 4px solid ${theme.palette.clinical.main};
    `}

    ${secure && css`
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      background-color: ${theme.palette.background.paper}E6;
    `}

    &:hover {
      box-shadow: ${theme.shadows.elevated};
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `}
`;
import React from 'react'; // ^18.2.0
import styled from '@emotion/styled'; // ^11.11.0
import { keyframes } from '@emotion/react'; // ^11.11.0
import { palette, spacing } from '../../styles/theme';

// Size configurations following Material Design specifications
const LOADER_SIZES = {
  small: {
    width: spacing.lg,
    height: spacing.lg,
    borderWidth: spacing.xs
  },
  medium: {
    width: spacing.xxl,
    height: spacing.xxl,
    borderWidth: spacing.sm
  },
  large: {
    width: spacing.section,
    height: spacing.section,
    borderWidth: spacing.md
  }
} as const;

// Animation duration following Material Design timing
const ANIMATION_DURATION = '1.4s';
const Z_INDEX_OVERLAY = 1000;

// Interface for component props
interface LoaderProps {
  size?: 'small' | 'medium' | 'large';
  color?: 'primary' | 'secondary' | 'white';
  overlay?: boolean;
  className?: string;
  ariaLabel?: string;
}

// Spinning animation with optimal performance
const spin = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`;

// Helper function to get color based on variant
const getLoaderColor = (colorVariant: LoaderProps['color']) => {
  switch (colorVariant) {
    case 'primary':
      return palette.primary.main;
    case 'secondary':
      return palette.secondary.main;
    case 'white':
      return '#FFFFFF';
    default:
      return palette.primary.main;
  }
};

// Styled loader component with accessibility support
const StyledLoader = styled.div<LoaderProps>`
  width: ${props => LOADER_SIZES[props.size || 'medium'].width}px;
  height: ${props => LOADER_SIZES[props.size || 'medium'].height}px;
  border: ${props => LOADER_SIZES[props.size || 'medium'].borderWidth}px solid rgba(0, 0, 0, 0.1);
  border-top: ${props => LOADER_SIZES[props.size || 'medium'].borderWidth}px solid ${props => getLoaderColor(props.color)};
  border-radius: 50%;
  animation: ${spin} ${ANIMATION_DURATION} linear infinite;
  will-change: transform;
  
  @media (prefers-reduced-motion: reduce) {
    animation-duration: ${ANIMATION_DURATION};
  }
`;

// Styled overlay container
const LoaderOverlay = styled.div<{ overlay?: boolean }>`
  display: ${props => props.overlay ? 'flex' : 'inline-block'};
  justify-content: center;
  align-items: center;
  position: ${props => props.overlay ? 'fixed' : 'relative'};
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${props => props.overlay ? 'rgba(255, 255, 255, 0.9)' : 'transparent'};
  backdrop-filter: ${props => props.overlay ? 'blur(2px)' : 'none'};
  z-index: ${props => props.overlay ? Z_INDEX_OVERLAY : 'auto'};
`;

// Main Loader component
const Loader: React.FC<LoaderProps> = ({
  size = 'medium',
  color = 'primary',
  overlay = false,
  className,
  ariaLabel = 'Loading'
}) => {
  // Handle keyboard trap for overlay mode
  React.useEffect(() => {
    if (overlay) {
      const previousActiveElement = document.activeElement as HTMLElement;
      return () => {
        previousActiveElement?.focus();
      };
    }
  }, [overlay]);

  return (
    <LoaderOverlay 
      overlay={overlay}
      role="alert"
      aria-busy="true"
      aria-live="polite"
      className={className}
    >
      <StyledLoader
        size={size}
        color={color}
        aria-label={ariaLabel}
        data-testid="loader"
      />
    </LoaderOverlay>
  );
};

export default Loader;
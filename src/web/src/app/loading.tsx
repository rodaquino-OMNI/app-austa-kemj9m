import React from 'react'; // ^18.2.0
import styled from '@emotion/styled'; // ^11.11.0
import Loader from '../components/common/Loader';
import { palette } from '../styles/theme';

// Constants for accessibility and styling
const ARIA_LABEL = 'Loading page content, please wait...';
const Z_INDEX_LOADING = 9999;

// Styled container for full viewport coverage with proper z-index management
const LoadingContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  background-color: ${palette.background.default};
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: ${Z_INDEX_LOADING};
  opacity: 0.98;
  backdrop-filter: blur(4px);
  transition: opacity 0.2s ease-in-out;

  /* Ensure content is hidden from screen readers when loading */
  &[aria-busy="true"] {
    cursor: wait;
  }

  /* Prevent interaction with background content */
  & ~ * {
    pointer-events: none;
  }

  /* Reduce motion if user prefers */
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/**
 * Loading component for Next.js route transitions and data fetching
 * Implements Material Design 3.0 loading patterns with accessibility support
 */
const Loading: React.FC = () => {
  // Handle focus management when loading appears
  React.useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement;
    
    return () => {
      // Restore focus when loading completes
      previousFocus?.focus();
    };
  }, []);

  return (
    <LoadingContainer
      role="progressbar"
      aria-busy="true"
      aria-label={ARIA_LABEL}
      data-testid="page-loading"
    >
      <Loader
        size="large"
        color="primary"
        overlay={false}
        ariaLabel={ARIA_LABEL}
      />
    </LoadingContainer>
  );
};

export default Loading;
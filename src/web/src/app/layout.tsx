'use client';

import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles'; // v5.14.0
import CssBaseline from '@mui/material/CssBaseline'; // v5.14.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.0
import styled from '@emotion/styled';

// Internal imports
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import theme from '../styles/theme';

// Constants
const MAIN_CONTENT_MIN_HEIGHT = 'calc(100vh - var(--header-height) - var(--footer-height))';
const CLINICAL_MODE_BREAKPOINTS = { xs: 320, sm: 768, md: 1024, lg: 1440, xl: 1920 };
const EMERGENCY_SHORTCUTS = { toggle: 'ctrl+shift+e', help: 'ctrl+shift+h' };

// Types
interface RootLayoutProps {
  children: React.ReactNode;
  clinicalMode?: boolean;
  emergencyMode?: boolean;
}

// Styled Components
const SkipLink = styled.a`
  position: absolute;
  left: -9999px;
  top: 20px;
  z-index: 9999;
  padding: 1rem;
  background: ${theme.palette.primary.main};
  color: ${theme.palette.primary.contrastText};
  text-decoration: none;
  border-radius: ${theme.shape.borderRadius}px;

  &:focus {
    left: 20px;
  }
`;

const MainContent = styled.main<{ clinicalMode?: boolean }>`
  min-height: ${MAIN_CONTENT_MIN_HEIGHT};
  background-color: ${({ clinicalMode }) =>
    clinicalMode ? (theme.palette.background as any).clinical : theme.palette.background.default};
  padding-top: var(--header-height);
  transition: background-color 0.3s ease;

  @media print {
    padding-top: 0;
    min-height: auto;
  }
`;

const ErrorFallback = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${8 * 3}px;
  background-color: ${theme.palette.error.light};
  color: ${theme.palette.error.contrastText};
`;

// Error Boundary Component
const ErrorFallbackComponent: React.FC<{ error: Error }> = ({ error }) => (
  <ErrorFallback role="alert">
    <h1>Critical System Error</h1>
    <p>Please contact emergency support immediately.</p>
    <p>Error Reference: {error.message}</p>
  </ErrorFallback>
);

const RootLayout: React.FC<RootLayoutProps> = ({
  children,
  clinicalMode = false,
  emergencyMode = false,
}) => {
  const [isEmergencyMode, setIsEmergencyMode] = useState(emergencyMode);

  // Handle emergency mode keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === 'e'
      ) {
        setIsEmergencyMode(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Set CSS custom properties
  useEffect(() => {
    document.documentElement.style.setProperty('--header-height', '64px');
    document.documentElement.style.setProperty('--footer-height', '80px');
  }, []);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallbackComponent}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        
        {/* Accessibility skip link */}
        <SkipLink href="#main-content">
          Skip to main content
        </SkipLink>

        {/* Header with clinical and emergency mode support */}
        <Header
          transparent={false}
          emergencyMode={isEmergencyMode}
          clinicalEnvironment={clinicalMode ? 'CLINIC' : 'STANDARD'}
        />

        {/* Main content area */}
        <MainContent
          id="main-content"
          role="main"
          clinicalMode={clinicalMode}
          aria-live={isEmergencyMode ? 'assertive' : 'polite'}
        >
          {children}
        </MainContent>

        {/* Footer with emergency contacts */}
        <Footer />
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default RootLayout;
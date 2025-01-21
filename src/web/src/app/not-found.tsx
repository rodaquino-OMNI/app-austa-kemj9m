'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation'; // ^13.0.0
import styled from '@emotion/styled'; // ^11.11.0
import Button from '../../components/common/Button';
import { Analytics } from '../../lib/utils/analytics';

// Styled components with Material Design 3.0 and WCAG compliance
const NotFoundContainer = styled.main`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background-color: var(--md-sys-color-background);
  color: var(--md-sys-color-on-background);
`;

const NotFoundContent = styled.div`
  text-align: center;
  max-width: 600px;
  color: var(--md-sys-color-on-surface);
  background-color: var(--md-sys-color-surface);
  padding: 2rem;
  border-radius: var(--md-sys-shape-corner-large);
  box-shadow: var(--md-sys-elevation-1);
`;

const NotFoundTitle = styled.h1`
  font-size: clamp(2rem, 5vw, 2.5rem);
  font-weight: 700;
  margin-bottom: 1rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const NotFoundDescription = styled.p`
  font-size: 1.125rem;
  line-height: 1.6;
  margin-bottom: 2rem;
  color: var(--md-sys-color-on-surface);
`;

const NotFoundImage = styled.div`
  margin-bottom: 2rem;
  svg {
    width: 200px;
    height: auto;
    color: var(--md-sys-color-primary);
  }
`;

// Error messages with WCAG-compliant text
const ERROR_MESSAGES = {
  title: 'Page Not Found',
  description: "We couldn't find the page you're looking for. Please check the URL or return to the home page.",
  buttonText: 'Return to Home',
  ariaLabels: {
    main: '404 error page',
    title: '404 error: Page not found',
    button: 'Return to home page'
  }
} as const;

const NotFound: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    // Track 404 error with HIPAA-compliant data sanitization
    const errorContext = {
      path: window.location.pathname,
      referrer: document.referrer,
      userAgent: window.navigator.userAgent,
      timestamp: Date.now()
    };

    Analytics.trackError(
      new Error('404 Page Not Found'),
      {
        errorType: '404',
        context: errorContext,
        component: 'NotFoundPage'
      }
    ).catch(console.error);
  }, []);

  const handleReturnHome = () => {
    Analytics.trackEvent({
      name: 'return_home_click',
      category: Analytics.AnalyticsCategory.USER_INTERACTION,
      properties: {
        source: '404_page',
        path: window.location.pathname
      },
      timestamp: Date.now(),
      userConsent: true,
      privacyLevel: Analytics.PrivacyLevel.PUBLIC,
      auditInfo: {
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        userId: 'anonymous',
        ipAddress: 'masked',
        actionType: 'navigation'
      }
    }).catch(console.error);

    router.push('/');
  };

  return (
    <NotFoundContainer role="main" aria-label={ERROR_MESSAGES.ariaLabels.main}>
      <NotFoundContent>
        <NotFoundImage>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </NotFoundImage>
        <NotFoundTitle aria-label={ERROR_MESSAGES.ariaLabels.title}>
          {ERROR_MESSAGES.title}
        </NotFoundTitle>
        <NotFoundDescription>
          {ERROR_MESSAGES.description}
        </NotFoundDescription>
        <Button
          variant="primary"
          size="large"
          onClick={handleReturnHome}
          aria-label={ERROR_MESSAGES.ariaLabels.button}
          highContrast={true}
        >
          {ERROR_MESSAGES.buttonText}
        </Button>
      </NotFoundContent>
    </NotFoundContainer>
  );
};

export default NotFound;
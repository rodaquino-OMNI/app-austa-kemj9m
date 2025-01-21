import React from 'react'; // ^18.2.0
import styled from '@emotion/styled'; // ^11.11.0
import { Alert, Button, Typography, Box } from '@mui/material'; // ^5.0.0
import { Analytics } from '../../lib/utils/analytics';
import Loader from './Loader';

// Styled components for error UI
const ErrorContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing(3)};
  text-align: center;
  min-height: 200px;
  width: 100%;
`;

const ErrorMessage = styled(Typography)`
  margin: ${({ theme }) => theme.spacing(2, 0)};
`;

// Interface definitions
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo, context: Analytics.ErrorContext) => void;
  retryAttempts?: number;
  recoveryInterval?: number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
  isRecovering: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private recoveryTimeout: NodeJS.Timeout | null = null;
  private errorContext: Record<string, unknown> = {};

  static defaultProps = {
    retryAttempts: 3,
    recoveryInterval: 1000,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRecovering: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Collect error context
    this.errorContext = {
      componentStack: errorInfo.componentStack,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      retryCount: this.state.retryCount,
    };

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Track error with sanitized data
    Analytics.trackError(error, this.errorContext).catch(console.error);

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo, this.errorContext);
    }

    // Attempt recovery if retries are available
    if (this.state.retryCount < (this.props.retryAttempts || 3)) {
      this.attemptRecovery();
    }

    // Log sanitized error in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  componentWillUnmount(): void {
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
    }
    this.errorContext = {};
  }

  attemptRecovery = (): void => {
    const { retryAttempts = 3, recoveryInterval = 1000 } = this.props;
    const { retryCount } = this.state;

    if (retryCount < retryAttempts) {
      this.setState({ isRecovering: true });

      this.recoveryTimeout = setTimeout(() => {
        this.setState(prevState => ({
          hasError: false,
          error: null,
          errorInfo: null,
          retryCount: prevState.retryCount + 1,
          isRecovering: false,
        }));
      }, recoveryInterval);

      // Track recovery attempt
      Analytics.trackEvent({
        name: 'error_recovery_attempt',
        category: Analytics.AnalyticsCategory.SYSTEM_PERFORMANCE,
        properties: {
          retryCount: retryCount + 1,
          maxRetries: retryAttempts,
          errorType: this.state.error?.name,
        },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: Analytics.PrivacyLevel.INTERNAL,
        auditInfo: {
          eventId: `recovery_${Date.now()}`,
          timestamp: Date.now(),
          userId: 'system',
          ipAddress: 'internal',
          actionType: 'error_recovery',
        },
      }).catch(console.error);
    }
  };

  render(): React.ReactNode {
    const { hasError, error, isRecovering } = this.state;
    const { children, fallback } = this.props;

    if (isRecovering) {
      return (
        <ErrorContainer>
          <Loader 
            size="medium"
            color="primary"
            ariaLabel="Attempting to recover from error"
          />
          <ErrorMessage variant="body1">
            Attempting to recover...
          </ErrorMessage>
        </ErrorContainer>
      );
    }

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <ErrorContainer role="alert" aria-live="polite">
          <Alert 
            severity="error"
            sx={{ mb: 2 }}
            aria-atomic="true"
          >
            {error?.message || 'An unexpected error occurred'}
          </Alert>
          <ErrorMessage variant="body1">
            We apologize for the inconvenience. Please try again or contact support if the problem persists.
          </ErrorMessage>
          <Button
            variant="contained"
            color="primary"
            onClick={() => window.location.reload()}
            aria-label="Reload page"
          >
            Reload Page
          </Button>
        </ErrorContainer>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
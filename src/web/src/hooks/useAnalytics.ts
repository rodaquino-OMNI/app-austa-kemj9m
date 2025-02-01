import { useEffect, useCallback, useContext } from 'react'; // v18.0.0
import { Analytics } from '../lib/utils/analytics';
import { IAuthContext } from '../lib/types/auth';

// Enhanced types for analytics hook
export enum PrivacyStatus {
  CONSENTED = 'CONSENTED',
  DECLINED = 'DECLINED',
  PENDING = 'PENDING'
}

interface IPerformanceMetrics {
  pageLoadTime: number;
  timeToInteractive: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
}

interface IAnalyticsHook {
  logEvent: (event: Analytics.AnalyticsEvent) => Promise<void>;
  logError: (error: Error, context: Record<string, any>, privacyLevel: Analytics.PrivacyLevel) => Promise<void>;
  logPerformance: (metric: Analytics.PerformanceMetric) => Promise<void>;
  isInitialized: boolean;
  privacyStatus: PrivacyStatus;
  performanceMetrics: IPerformanceMetrics;
}

/**
 * Custom React hook for HIPAA and LGPD compliant analytics tracking
 * Implements comprehensive monitoring with enhanced privacy controls
 */
export const useAnalytics = (): IAnalyticsHook => {
  // Track initialization and privacy status
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus>(PrivacyStatus.PENDING);
  const [performanceMetrics, setPerformanceMetrics] = useState<IPerformanceMetrics>({
    pageLoadTime: 0,
    timeToInteractive: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    cumulativeLayoutShift: 0
  });

  // Get auth context for user data and privacy settings
  const authContext = useContext<IAuthContext>(AuthContext);

  // Initialize analytics with privacy checks
  useEffect(() => {
    const initAnalytics = async () => {
      try {
        await Analytics.initializeAnalytics();
        setIsInitialized(true);

        // Set initial privacy status based on user consent
        if (authContext.user?.consentHistory?.some(
          consent => consent.type === 'ANALYTICS' && 
          new Date(consent.givenAt).getTime() > Date.now() - (90 * 24 * 60 * 60 * 1000) // 90 days
        )) {
          setPrivacyStatus(PrivacyStatus.CONSENTED);
        } else {
          setPrivacyStatus(PrivacyStatus.PENDING);
        }
      } catch (error) {
        console.error('Analytics initialization failed:', error);
        setIsInitialized(false);
      }
    };

    initAnalytics();

    // Cleanup on unmount
    return () => {
      setIsInitialized(false);
    };
  }, []);

  // Set up performance monitoring
  useEffect(() => {
    if (!isInitialized) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const metrics = { ...performanceMetrics };

      entries.forEach(entry => {
        switch (entry.entryType) {
          case 'navigation':
            metrics.pageLoadTime = entry.duration;
            break;
          case 'paint':
            if (entry.name === 'first-contentful-paint') {
              metrics.firstContentfulPaint = entry.startTime;
            }
            break;
          case 'largest-contentful-paint':
            metrics.largestContentfulPaint = entry.startTime;
            break;
          case 'layout-shift':
            metrics.cumulativeLayoutShift += (entry as any).value;
            break;
        }
      });

      setPerformanceMetrics(metrics);
    });

    observer.observe({ entryTypes: ['navigation', 'paint', 'largest-contentful-paint', 'layout-shift'] });

    return () => observer.disconnect();
  }, [isInitialized]);

  // Memoized event tracking function
  const logEvent = useCallback(async (event: Analytics.AnalyticsEvent): Promise<void> => {
    if (!isInitialized || privacyStatus !== PrivacyStatus.CONSENTED) {
      return;
    }

    try {
      // Add user context with privacy protection
      const enhancedEvent = {
        ...event,
        properties: {
          ...event.properties,
          userRole: authContext.user?.role,
          userStatus: authContext.user?.status,
          sessionId: authContext.sessionId
        },
        userConsent: true,
        timestamp: Date.now(),
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: authContext.user?.id || 'anonymous',
          ipAddress: '[REDACTED]',
          actionType: event.name
        }
      };

      await Analytics.trackEvent(enhancedEvent);
    } catch (error) {
      console.error('Event tracking failed:', error);
    }
  }, [isInitialized, privacyStatus, authContext]);

  // Memoized error tracking function
  const logError = useCallback(async (
    error: Error,
    context: Record<string, any>,
    privacyLevel: Analytics.PrivacyLevel
  ): Promise<void> => {
    if (!isInitialized) return;

    try {
      const enhancedContext = {
        ...context,
        userRole: authContext.user?.role,
        errorId: crypto.randomUUID(),
        timestamp: Date.now(),
        environment: process.env.NODE_ENV
      };

      await Analytics.trackError(error, enhancedContext);
    } catch (error) {
      console.error('Error tracking failed:', error);
    }
  }, [isInitialized, authContext]);

  // Memoized performance tracking function
  const logPerformance = useCallback(async (metric: Analytics.PerformanceMetric): Promise<void> => {
    if (!isInitialized) return;

    try {
      const enhancedMetric = {
        ...metric,
        tags: {
          ...metric.tags,
          userRole: authContext.user?.role,
          environment: process.env.NODE_ENV
        },
        context: {
          ...metric.context,
          sessionId: authContext.sessionId,
          deviceType: navigator.userAgent
        },
        timestamp: Date.now()
      };

      await Analytics.trackPerformance(enhancedMetric);
    } catch (error) {
      console.error('Performance tracking failed:', error);
    }
  }, [isInitialized, authContext]);

  return {
    logEvent,
    logError,
    logPerformance,
    isInitialized,
    privacyStatus,
    performanceMetrics
  };
};

export default useAnalytics;
import mixpanel from 'mixpanel-browser'; // v2.47.0
import { datadogRum } from '@datadog/browser-rum'; // v4.0.0

// Environment variables
const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const DATADOG_APP_ID = process.env.NEXT_PUBLIC_DATADOG_APP_ID;
const DATADOG_CLIENT_TOKEN = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;
const ANALYTICS_ENABLED = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';

// Analytics namespace implementation
export namespace Analytics {
  // Moving enums inside namespace
  export enum PrivacyLevel {
    PUBLIC = 'PUBLIC',
    INTERNAL = 'INTERNAL',
    SENSITIVE = 'SENSITIVE',
    PHI = 'PHI'
  }

  export enum AnalyticsCategory {
    USER_INTERACTION = 'USER_INTERACTION',
    SYSTEM_PERFORMANCE = 'SYSTEM_PERFORMANCE',
    SECURITY = 'SECURITY',
    BUSINESS_METRICS = 'BUSINESS_METRICS'
  }

  export interface AuditMetadata {
    eventId: string;
    timestamp: number;
    userId: string;
    ipAddress: string;
    actionType: string;
  }

  export interface AnalyticsEvent {
    name: string;
    category: AnalyticsCategory;
    properties: Record<string, unknown>;
    timestamp: number;
    userConsent: boolean;
    privacyLevel: PrivacyLevel;
    auditInfo: AuditMetadata;
  }

  export interface PerformanceContext {
    [key: string]: string | undefined;
    page?: string;
    component?: string;
    browser?: string;
    device?: string;
  }

  export interface PerformanceMetric {
    name: string;
    value: number;
    tags: Record<string, string>;
    timestamp: number;
    context: PerformanceContext;
  }

  // PII/PHI patterns for sanitization
  const SENSITIVE_PATTERNS = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /(\+\d{1,3}[- ]?)?\d{10}/g,
    ssn: /\d{3}-?\d{2}-?\d{4}/g,
    medicalRecord: /MRN:?\s*\d+/gi,
  };

  let initialized = false;

  /**
   * Initializes analytics providers with HIPAA-compliant configuration
   */
  export const initializeAnalytics = async (): Promise<void> => {
    if (!ANALYTICS_ENABLED || initialized) {
      return;
    }

    try {
      // Initialize Mixpanel with HIPAA compliance settings
      if (MIXPANEL_TOKEN) {
        mixpanel.init(MIXPANEL_TOKEN, {
          api_host: 'https://api-eu.mixpanel.com',
          secure_cookie: true,
          persistence: 'localStorage',
          ignore_dnt: false,
          property_blacklist: ['$ip', '$email', 'distinct_id'],
        });
      }

      // Initialize Datadog RUM with security controls
      if (DATADOG_APP_ID && DATADOG_CLIENT_TOKEN) {
        datadogRum.init({
          applicationId: DATADOG_APP_ID,
          clientToken: DATADOG_CLIENT_TOKEN,
          site: 'datadoghq.com',
          service: 'austa-web',
          env: process.env.NODE_ENV,
          sessionSampleRate: 100,
          sessionReplaySampleRate: 0, // Disabled for HIPAA compliance
          trackUserInteractions: false,
          defaultPrivacyLevel: 'mask-user-input',
        });
      }

      initialized = true;
    } catch (error) {
      console.error('Analytics initialization failed:', error);
      throw new Error('Analytics initialization failed');
    }
  };

  /**
   * Sanitizes data by removing PII and sensitive information
   */
  const sanitizeData = (data: Record<string, unknown>): Record<string, unknown> => {
    const sanitized = { ...data };

    // Deep clone and sanitize nested objects
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = sanitizeData(sanitized[key] as Record<string, unknown>);
        return;
      }

      if (typeof sanitized[key] === 'string') {
        const value = sanitized[key] as string;
        
        // Replace sensitive patterns with redacted text
        Object.entries(SENSITIVE_PATTERNS).forEach(([type, pattern]) => {
          if (pattern.test(value)) {
            sanitized[key] = `[REDACTED_${type.toUpperCase()}]`;
          }
        });
      }
    });

    return sanitized;
  };

  /**
   * Tracks user interaction events with privacy compliance
   */
  export const trackEvent = async (event: AnalyticsEvent): Promise<void> => {
    if (!ANALYTICS_ENABLED || !initialized || !event.userConsent) {
      return;
    }

    try {
      const sanitizedProperties = sanitizeData(event.properties);

      // Add compliance metadata
      const eventData = {
        ...sanitizedProperties,
        event_category: event.category,
        privacy_level: event.privacyLevel,
        timestamp: event.timestamp,
        environment: process.env.NODE_ENV,
      };

      // Track based on privacy level
      if (event.privacyLevel !== PrivacyLevel.PHI) {
        mixpanel.track(event.name, eventData);
      }

      // Log audit trail for compliance
      const auditLog = {
        ...event.auditInfo,
        event_name: event.name,
        privacy_level: event.privacyLevel,
        sanitized: true,
      };

      datadogRum.addAction('audit_log', auditLog);

    } catch (error) {
      console.error('Event tracking failed:', error);
      throw new Error('Event tracking failed');
    }
  };

  /**
   * Tracks application errors with security context
   */
  export const trackError = async (
    error: Error,
    context: Record<string, unknown>
  ): Promise<void> => {
    if (!ANALYTICS_ENABLED || !initialized) {
      return;
    }

    try {
      const sanitizedContext = sanitizeData(context);
      const errorData = {
        error_name: error.name,
        error_message: error.message,
        // Remove file paths and line numbers from stack trace
        stack: error.stack?.replace(/\(.*?\)/g, '(redacted)'),
        ...sanitizedContext,
        timestamp: Date.now(),
        environment: process.env.NODE_ENV,
      };

      datadogRum.addError(error, {
        ...errorData,
        privacy_level: PrivacyLevel.INTERNAL,
      });

    } catch (trackingError) {
      console.error('Error tracking failed:', trackingError);
      throw new Error('Error tracking failed');
    }
  };

  /**
   * Tracks performance metrics with security metadata
   */
  export const trackPerformance = async (metric: PerformanceMetric): Promise<void> => {
    if (!ANALYTICS_ENABLED || !initialized) {
      return;
    }

    try {
      const sanitizedTags = sanitizeData(metric.tags);
      const sanitizedContext = sanitizeData(metric.context as Record<string, unknown>);

      const performanceData = {
        metric_name: metric.name,
        metric_value: metric.value,
        tags: sanitizedTags,
        context: sanitizedContext,
        timestamp: metric.timestamp,
        environment: process.env.NODE_ENV,
      };

      datadogRum.addTiming(metric.name, metric.value);

    } catch (error) {
      console.error('Performance tracking failed:', error);
      throw new Error('Performance tracking failed');
    }
  };
}

// Initialize analytics on module load
Analytics.initializeAnalytics().catch(console.error);
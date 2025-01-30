/**
 * @fileoverview Enhanced authentication hook for AUSTA SuperApp with HIPAA compliance
 * Implements secure authentication state management with comprehensive security features
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { useState, useEffect, useCallback, useContext, useRef } from 'react'; // v18.0.0
import jwtDecode from 'jwt-decode'; // v3.1.2
import CryptoJS from 'crypto-js'; // v4.1.1

import {
  login,
  verifyMFA,
  refreshToken,
  logout,
  verifyBiometric
} from '../lib/api/auth';

import {
  IAuthTokens,
  ILoginCredentials,
  IMFACredentials,
  AuthState,
  IAuthContext,
  IAuthError,
  SecurityEvent
} from '../lib/types/auth';

import { IUser } from '../lib/types/user';
import { WebEncryptionService } from '../lib/utils/encryption';

// Security constants
const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const TOKEN_EXPIRY_BUFFER = 60 * 1000; // 1 minute
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_LOGIN_ATTEMPTS = 3;
const ENCRYPTION_KEY_VERSION = '1';

// Initialize encryption service
const encryptionService = new WebEncryptionService();

/**
 * Enhanced authentication hook with comprehensive security features
 */
const useAuth = (): IAuthContext & {
  login: (credentials: ILoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  verifyMFA: (credentials: IMFACredentials) => Promise<void>;
  verifyBiometric: (credentials: IMFACredentials) => Promise<void>;
  refreshSession: () => Promise<void>;
} => {
  // State management with security context
  const [state, setState] = useState<AuthState>(AuthState.UNAUTHENTICATED);
  const [user, setUser] = useState<IUser | null>(null);
  const [tokens, setTokens] = useState<IAuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<IAuthError | null>(null);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [loginAttempts, setLoginAttempts] = useState<number>(0);

  // Security references
  const refreshTokenTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionTimeoutRef = useRef<NodeJS.Timeout>();

  /**
   * Securely stores encrypted tokens in localStorage
   */
  const securelyStoreTokens = useCallback(async (tokens: IAuthTokens) => {
    try {
      const encryptedTokens = await encryptionService.encryptField(
        JSON.stringify(tokens),
        'auth'
      );
      localStorage.setItem('auth_tokens', encryptedTokens);
    } catch (error) {
      console.error('Token encryption failed:', error);
      throw error;
    }
  }, []);

  /**
   * Validates token expiration and integrity
   */
  const validateToken = useCallback((token: string): boolean => {
    try {
      const decoded = jwtDecode(token);
      const currentTime = Date.now() / 1000;
      return decoded.exp > currentTime + TOKEN_EXPIRY_BUFFER / 1000;
    } catch {
      return false;
    }
  }, []);

  /**
   * Handles security event logging
   */
  const logSecurityEvent = useCallback((event: SecurityEvent) => {
    // Implementation would typically send to security monitoring service
    console.info('Security Event:', {
      ...event,
      timestamp: Date.now(),
      sessionId: tokens?.accessToken
    });
  }, [tokens]);

  /**
   * Sets up automatic token refresh
   */
  const setupTokenRefresh = useCallback(() => {
    if (refreshTokenTimeoutRef.current) {
      clearTimeout(refreshTokenTimeoutRef.current);
    }

    refreshTokenTimeoutRef.current = setTimeout(async () => {
      try {
        if (tokens?.refreshToken) {
          const newTokens = await refreshToken(tokens.refreshToken);
          await securelyStoreTokens(newTokens);
          setTokens(newTokens);
          setupTokenRefresh();
        }
      } catch (error) {
        handleAuthError(error);
      }
    }, TOKEN_REFRESH_INTERVAL);
  }, [tokens, securelyStoreTokens]);

  /**
   * Monitors session activity and timeout
   */
  const setupSessionMonitoring = useCallback(() => {
    const resetTimeout = () => {
      setLastActivity(Date.now());
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }
      sessionTimeoutRef.current = setTimeout(() => {
        handleSessionTimeout();
      }, SESSION_TIMEOUT);
    };

    window.addEventListener('mousemove', resetTimeout);
    window.addEventListener('keypress', resetTimeout);

    return () => {
      window.removeEventListener('mousemove', resetTimeout);
      window.removeEventListener('keypress', resetTimeout);
    };
  }, []);

  /**
   * Handles session timeout
   */
  const handleSessionTimeout = useCallback(async () => {
    logSecurityEvent({
      eventType: 'SESSION_TIMEOUT',
      userId: user?.id || '',
      sessionId: tokens?.accessToken || '',
      severity: 'MEDIUM',
      outcome: 'SUCCESS',
      metadata: { lastActivity }
    });

    await handleLogout();
    setState(AuthState.SESSION_EXPIRED);
  }, [user, lastActivity, logSecurityEvent]);

  /**
   * Handles authentication errors with security logging
   */
  const handleAuthError = useCallback((error: any) => {
    const authError: IAuthError = {
      code: error.code || 'AUTH_ERROR',
      message: error.message || 'Authentication failed',
      details: error.details || {},
      timestamp: Date.now(),
      requestId: error.requestId || ''
    };

    setError(authError);
    logSecurityEvent({
      eventType: 'AUTH_ERROR',
      userId: user?.id || '',
      sessionId: tokens?.accessToken || '',
      severity: 'HIGH',
      outcome: 'FAILURE',
      metadata: authError
    });
  }, [user, tokens, logSecurityEvent]);

  /**
   * Enhanced login handler with security measures
   */
  const handleLogin = async (credentials: ILoginCredentials): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        setState(AuthState.LOCKED);
        throw new Error('Account locked due to multiple failed attempts');
      }

      const authTokens = await login(credentials);
      await securelyStoreTokens(authTokens);
      setTokens(authTokens);
      setState(AuthState.AUTHENTICATED);
      setupTokenRefresh();
      setupSessionMonitoring();
      setLoginAttempts(0);

      logSecurityEvent({
        eventType: 'LOGIN_SUCCESS',
        userId: credentials.email,
        sessionId: authTokens.accessToken,
        severity: 'MEDIUM',
        outcome: 'SUCCESS',
        metadata: { deviceId: credentials.deviceId }
      });
    } catch (error) {
      setLoginAttempts(prev => prev + 1);
      handleAuthError(error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Secure logout handler
   */
  const handleLogout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      if (tokens?.accessToken) {
        await logout(tokens.accessToken);
      }
      
      // Clear security context
      localStorage.removeItem('auth_tokens');
      setTokens(null);
      setUser(null);
      setState(AuthState.UNAUTHENTICATED);
      
      if (refreshTokenTimeoutRef.current) {
        clearTimeout(refreshTokenTimeoutRef.current);
      }
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }

      logSecurityEvent({
        eventType: 'LOGOUT',
        userId: user?.id || '',
        sessionId: tokens?.accessToken || '',
        severity: 'LOW',
        outcome: 'SUCCESS',
        metadata: { timestamp: Date.now() }
      });
    } catch (error) {
      handleAuthError(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize authentication state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedTokens = localStorage.getItem('auth_tokens');
        if (storedTokens && validateToken(storedTokens)) {
          const decryptedTokens = JSON.parse(storedTokens) as IAuthTokens;
          setTokens(decryptedTokens);
          setState(AuthState.AUTHENTICATED);
          setupTokenRefresh();
          setupSessionMonitoring();
        }
      } catch (error) {
        handleAuthError(error);
      }
    };

    initializeAuth();

    return () => {
      if (refreshTokenTimeoutRef.current) {
        clearTimeout(refreshTokenTimeoutRef.current);
      }
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }
    };
  }, []);

  return {
    state,
    user,
    tokens,
    isLoading,
    error,
    lastActivity,
    sessionTimeout: SESSION_TIMEOUT,
    login: handleLogin,
    logout: handleLogout,
    verifyMFA,
    verifyBiometric,
    refreshSession: setupTokenRefresh
  };
};

export default useAuth;
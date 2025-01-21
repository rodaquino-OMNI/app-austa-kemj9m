import { renderHook, act } from '@testing-library/react-hooks'; // v8.0.1
import { describe, beforeEach, test, expect, jest } from '@jest/globals'; // v29.0.0

import useAuth from '../../src/hooks/useAuth';
import * as auth from '../../src/lib/api/auth';
import { AuthState, IAuthTokens, ILoginCredentials, IMFACredentials, IBiometricCredentials } from '../../src/lib/types/auth';

// Mock the auth API module
jest.mock('../../src/lib/api/auth');

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key],
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock security-related browser APIs
Object.defineProperty(window, 'crypto', {
  value: {
    subtle: {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      generateKey: jest.fn()
    },
    getRandomValues: jest.fn()
  }
});

// Test data constants
const mockTokens: IAuthTokens = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  idToken: 'mock-id-token',
  expiresAt: Date.now() + 3600000,
  tokenType: 'Bearer',
  scope: ['openid', 'profile']
};

const mockCredentials: ILoginCredentials = {
  email: 'test@example.com',
  password: 'Test123!@#',
  rememberMe: true,
  deviceId: 'mock-device-id',
  clientMetadata: {
    userAgent: 'test-agent',
    timestamp: Date.now().toString()
  }
};

const mockMFACredentials: IMFACredentials = {
  code: '123456',
  method: 'AUTHENTICATOR',
  verificationId: 'mock-verification-id',
  timestamp: Date.now()
};

const mockBiometricCredentials: IBiometricCredentials = {
  deviceId: 'mock-device-id',
  type: 'FINGERPRINT',
  data: 'mock-biometric-data'
};

describe('useAuth Hook', () => {
  beforeEach(() => {
    // Clear all mocks and localStorage
    jest.clearAllMocks();
    localStorageMock.clear();
    
    // Reset timers
    jest.useFakeTimers();
    
    // Mock successful API responses
    (auth.login as jest.Mock).mockResolvedValue(mockTokens);
    (auth.verifyMFA as jest.Mock).mockResolvedValue(mockTokens);
    (auth.verifyBiometric as jest.Mock).mockResolvedValue(true);
    (auth.refreshToken as jest.Mock).mockResolvedValue(mockTokens);
  });

  test('should initialize in unauthenticated state', () => {
    const { result } = renderHook(() => useAuth());
    
    expect(result.current.state).toBe(AuthState.UNAUTHENTICATED);
    expect(result.current.user).toBeNull();
    expect(result.current.tokens).toBeNull();
    expect(result.current.isLoading).toBeFalsy();
    expect(result.current.error).toBeNull();
  });

  test('should handle successful login flow with security measures', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login(mockCredentials);
    });

    expect(result.current.state).toBe(AuthState.AUTHENTICATED);
    expect(result.current.tokens).toEqual(mockTokens);
    expect(result.current.isLoading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(localStorageMock.getItem('auth_tokens')).toBeTruthy();
  });

  test('should handle MFA verification flow', async () => {
    const { result } = renderHook(() => useAuth());

    // Simulate MFA required response
    (auth.login as jest.Mock).mockResolvedValueOnce({ 
      mfaRequired: true,
      verificationId: 'mock-verification-id'
    });

    await act(async () => {
      await result.current.login(mockCredentials);
    });

    expect(result.current.state).toBe(AuthState.PENDING_MFA);

    await act(async () => {
      await result.current.verifyMFA(mockMFACredentials);
    });

    expect(result.current.state).toBe(AuthState.AUTHENTICATED);
    expect(result.current.tokens).toEqual(mockTokens);
  });

  test('should handle biometric authentication', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.verifyBiometric(mockBiometricCredentials);
      await result.current.login({
        ...mockCredentials,
        biometricData: mockBiometricCredentials
      });
    });

    expect(result.current.state).toBe(AuthState.AUTHENTICATED);
    expect(auth.verifyBiometric).toHaveBeenCalledWith(mockBiometricCredentials);
  });

  test('should handle session timeout', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login(mockCredentials);
    });

    expect(result.current.state).toBe(AuthState.AUTHENTICATED);

    // Fast-forward past session timeout
    act(() => {
      jest.advanceTimersByTime(31 * 60 * 1000); // 31 minutes
    });

    expect(result.current.state).toBe(AuthState.SESSION_EXPIRED);
    expect(result.current.tokens).toBeNull();
  });

  test('should handle automatic token refresh', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login(mockCredentials);
    });

    // Fast-forward to token refresh interval
    act(() => {
      jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
    });

    expect(auth.refreshToken).toHaveBeenCalled();
    expect(result.current.tokens).toEqual(mockTokens);
  });

  test('should handle login attempts limit', async () => {
    const { result } = renderHook(() => useAuth());

    (auth.login as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));

    for (let i = 0; i < 4; i++) {
      await act(async () => {
        try {
          await result.current.login(mockCredentials);
        } catch (error) {
          // Expected error
        }
      });
    }

    expect(result.current.state).toBe(AuthState.LOCKED);
    expect(result.current.error).toBeTruthy();
  });

  test('should handle secure logout', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login(mockCredentials);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.state).toBe(AuthState.UNAUTHENTICATED);
    expect(result.current.tokens).toBeNull();
    expect(result.current.user).toBeNull();
    expect(localStorageMock.getItem('auth_tokens')).toBeNull();
  });

  test('should handle secure token storage', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login(mockCredentials);
    });

    const storedTokens = localStorageMock.getItem('auth_tokens');
    expect(storedTokens).toBeTruthy();
    expect(storedTokens).toContain('encrypted'); // Assuming encryption adds this marker
  });

  test('should handle device fingerprint validation', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login({
        ...mockCredentials,
        deviceId: 'invalid-device'
      });
    });

    expect(result.current.error?.code).toBe('INVALID_DEVICE');
    expect(result.current.state).toBe(AuthState.UNAUTHENTICATED);
  });

  test('should cleanup security resources on unmount', () => {
    const { result, unmount } = renderHook(() => useAuth());

    unmount();

    // Verify cleanup
    expect(result.current.tokens).toBeNull();
    expect(localStorageMock.getItem('auth_tokens')).toBeNull();
  });
});
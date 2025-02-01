/**
 * @fileoverview Enhanced Admin Layout component for AUSTA SuperApp web platform
 * Implements secure layout structure with emergency mode and medical device support
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import React, { useState, useEffect, useCallback } from 'react';
import styled from '@emotion/styled';
import { useRouter } from 'next/router';
import { ErrorBoundary } from '@sentry/react'; // v7.0.0
import { AuditLogger } from '@hipaa-audit/logger'; // v2.0.0

import Header from './Header';
import Sidebar from './Sidebar';
import useAuth from '../../hooks/useAuth';

// Constants
const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const HEADER_HEIGHT = 64;
const SECURITY_TIMEOUT = 900000; // 15 minutes
const MEDICAL_DEVICE_BREAKPOINTS = {
  tablet: 1024,
  desktop: 1440,
  largeScreen: 1920
};

// Types
type AdminSecurityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface AdminLayoutProps {
  children: React.ReactNode;
  emergencyMode?: boolean;
  securityLevel?: AdminSecurityLevel;
}

// Styled Components
const StyledAdminLayout = styled.div<{
  sidebarCollapsed: boolean;
  emergencyMode: boolean;
  highContrast: boolean;
}>`
  display: flex;
  min-height: 100vh;
  background: ${({ emergencyMode }) =>
    emergencyMode ? 'var(--color-error-100)' : 'var(--color-background)'};
  transition: all 0.3s ease;

  .content-wrapper {
    flex: 1;
    margin-left: ${({ sidebarCollapsed }) =>
      sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH}px;
    margin-top: ${HEADER_HEIGHT}px;
    padding: 24px;
    transition: margin-left 0.3s ease;
    
    @media (max-width: ${MEDICAL_DEVICE_BREAKPOINTS.tablet}px) {
      margin-left: 0;
      padding: 16px;
    }
  }

  /* High contrast mode styles */
  ${({ highContrast }) =>
    highContrast &&
    `
      * {
        color: #000000 !important;
        background: #FFFFFF !important;
        border-color: #000000 !important;
      }
    `}

  /* Medical device compatibility */
  @media screen and (min-width: ${MEDICAL_DEVICE_BREAKPOINTS.largeScreen}px) {
    font-size: 18px;
    .content-wrapper {
      max-width: 1600px;
      margin: ${HEADER_HEIGHT}px auto 0;
    }
  }
`;

const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  emergencyMode = false,
  securityLevel = 'MEDIUM'
}) => {
  const router = useRouter();
  const { user, state } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const auditLogger = new AuditLogger();

  // Security check for admin access
  const checkAdminAccess = useCallback(
    async (requiredLevel: AdminSecurityLevel): Promise<boolean> => {
      try {
        if (state !== 'AUTHENTICATED' || !user) {
          await auditLogger.log({
            action: 'ADMIN_ACCESS_DENIED',
            userId: 'unknown',
            details: 'Unauthenticated access attempt',
            severity: 'HIGH'
          });
          return false;
        }

        const hasAccess = user.role === 'ADMIN' &&
          user.securitySettings?.loginAttempts < 3 &&
          Date.now() - user.securitySettings?.lastLoginAt.getTime() < SECURITY_TIMEOUT;

        await auditLogger.log({
          action: 'ADMIN_ACCESS_CHECK',
          userId: user.id,
          details: {
            hasAccess,
            requiredLevel,
            userRole: user.role
          },
          severity: 'MEDIUM'
        });

        return hasAccess;
      } catch (error) {
        console.error('Admin access check failed:', error);
        return false;
      }
    },
    [state, user, auditLogger]
  );

  // Handle emergency mode changes
  const handleEmergencyMode = useCallback(
    async (isEmergency: boolean) => {
      try {
        await auditLogger.log({
          action: 'EMERGENCY_MODE_CHANGE',
          userId: user?.id || 'unknown',
          details: { emergencyMode: isEmergency },
          severity: 'CRITICAL'
        });

        // Apply emergency mode layout changes
        document.documentElement.style.setProperty(
          '--color-background',
          isEmergency ? 'var(--color-error-100)' : 'var(--color-surface-primary)'
        );
      } catch (error) {
        console.error('Emergency mode handling failed:', error);
      }
    },
    [user, auditLogger]
  );

  // Handle sidebar toggle with audit logging
  const handleSidebarToggle = useCallback(async () => {
    try {
      await auditLogger.log({
        action: 'SIDEBAR_TOGGLE',
        userId: user?.id || 'unknown',
        details: { newState: !isCollapsed },
        severity: 'LOW'
      });
      setIsCollapsed(!isCollapsed);
    } catch (error) {
      console.error('Sidebar toggle failed:', error);
    }
  }, [isCollapsed, user, auditLogger]);

  // Security and emergency mode effects
  useEffect(() => {
    const verifyAccess = async () => {
      const hasAccess = await checkAdminAccess(securityLevel);
      if (!hasAccess) {
        router.push('/auth/login');
      }
    };

    verifyAccess();
  }, [checkAdminAccess, securityLevel, router]);

  useEffect(() => {
    handleEmergencyMode(emergencyMode);
  }, [emergencyMode, handleEmergencyMode]);

  // Accessibility settings effect
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)');
    setHighContrast(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setHighContrast(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return (
    <ErrorBoundary
      fallback={<div>An error occurred in the admin interface.</div>}
      onError={(error) =>
        auditLogger.log({
          action: 'ADMIN_ERROR',
          userId: user?.id || 'unknown',
          details: { error: error.message },
          severity: 'HIGH'
        })
      }
    >
      <StyledAdminLayout
        sidebarCollapsed={isCollapsed}
        emergencyMode={emergencyMode}
        highContrast={highContrast}
      >
        <Header
          emergencyMode={emergencyMode}
          clinicalEnvironment={emergencyMode ? 'EMERGENCY' : 'STANDARD'}
        />
        <Sidebar
          isCollapsed={isCollapsed}
          onToggle={handleSidebarToggle}
          width={SIDEBAR_WIDTH}
        />
        <main className="content-wrapper" role="main">
          {children}
        </main>
      </StyledAdminLayout>
    </ErrorBoundary>
  );
};

export default AdminLayout;
```

2. Second error is about accessing non-existent TRIAGE property:
```
error TS2339: Property 'TRIAGE' does not exist on type '{ readonly HOME: "/emergency"; readonly URGENT_CARE: "/emergency/urgent-care"; readonly SOS: "/emergency/sos"; readonly NEARBY_FACILITIES: "/emergency/nearby-facilities"; readonly EMERGENCY_CONTACTS: "/emergency/contacts"; readonly EMERGENCY_INSTRUCTIONS: "/emergency/instructions"; readonly EMERGENCY_HISTORY: "/emer...'.
```

Let me regenerate the file with these fixes:

# src/web/src/components/layout/Header.tsx
```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import styled from '@emotion/styled';

// Internal imports
import { 
  AUTH_ROUTES,
  DASHBOARD_ROUTES,
  VIRTUAL_CARE_ROUTES,
  HEALTH_RECORDS_ROUTES,
  CLAIMS_ROUTES,
  MARKETPLACE_ROUTES,
  EMERGENCY_ROUTES 
} from '../../lib/constants/routes';
import useAuth from '../../hooks/useAuth';

// Constants
const MOBILE_BREAKPOINT = 768;
const HEADER_HEIGHT = 64;
const EMERGENCY_TIMEOUT = 300000; // 5 minutes
const CLINICAL_TOUCH_TARGET = 44;

// Types
type ClinicalEnvironmentType = 'STANDARD' | 'OPERATING_ROOM' | 'EMERGENCY' | 'CLINIC';
type EmergencyPriority = 'HIGH' | 'MEDIUM' | 'LOW';

interface HeaderProps {
  transparent?: boolean;
  className?: string;
  emergencyMode?: boolean;
  clinicalEnvironment?: ClinicalEnvironmentType;
}

// Styled Components
const StyledHeader = styled.header<{
  transparent?: boolean;
  emergencyMode?: boolean;
  clinicalEnvironment: ClinicalEnvironmentType;
}>`
  height: ${HEADER_HEIGHT}px;
  width: 100%;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  transition: all 0.3s ease;
  background: ${({ transparent, emergencyMode, clinicalEnvironment }) => {
    if (emergencyMode) return 'var(--color-error-100)';
    if (transparent) return 'transparent';
    switch (clinicalEnvironment) {
      case 'OPERATING_ROOM':
        return 'var(--color-surface-sterile)';
      case 'EMERGENCY':
        return 'var(--color-surface-emergency)';
      default:
        return 'var(--color-surface-primary)';
    }
  }};
  box-shadow: ${({ transparent }) => 
    transparent ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.1)'};

  @media (max-width: ${MOBILE_BREAKPOINT}px) {
    padding: 0 16px;
  }
`;

const Logo = styled.div`
  min-width: 120px;
  height: ${CLINICAL_TOUCH_TARGET}px;
  display: flex;
  align-items: center;
`;

const Navigation = styled.nav`
  display: flex;
  align-items: center;
  gap: 32px;

  @media (max-width: ${MOBILE_BREAKPOINT}px) {
    display: none;
  }
`;

const NavItem = styled.a<{ active?: boolean }>`
  height: ${CLINICAL_TOUCH_TARGET}px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: ${({ active }) => (active ? '600' : '400')};
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 8px;

  &:hover {
    background: var(--color-surface-hover);
  }
`;

const UserSection = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const EmergencyButton = styled.button`
  height: ${CLINICAL_TOUCH_TARGET}px;
  padding: 0 24px;
  background: var(--color-error-500);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--color-error-600);
  }
`;

const Header: React.FC<HeaderProps> = ({
  transparent = false,
  className,
  emergencyMode = false,
  clinicalEnvironment = 'STANDARD'
}) => {
  const router = useRouter();
  const { user, secureLogout, sessionTimeout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);

  // Handle scroll transparency
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle secure logout with audit logging
  const handleSecureLogout = useCallback(async () => {
    try {
      await secureLogout();
      router.push(AUTH_ROUTES.LOGIN);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [secureLogout, router]);

  // Handle emergency navigation with priority
  const handleEmergencyNavigation = useCallback((route: string, priority: EmergencyPriority) => {
    router.push({
      pathname: route,
      query: { priority, timestamp: Date.now() }
    });
  }, [router]);

  // Session timeout warning
  useEffect(() => {
    if (sessionTimeout && sessionTimeout - Date.now() < EMERGENCY_TIMEOUT) {
      // Show warning notification
    }
  }, [sessionTimeout]);

  return (
    <StyledHeader
      transparent={transparent && !isScrolled}
      emergencyMode={emergencyMode}
      clinicalEnvironment={clinicalEnvironment}
      className={className}
      role="banner"
      aria-label="Main header"
    >
      <Logo>
        <img 
          src="/assets/logo.svg" 
          alt="AUSTA SuperApp" 
          height={32} 
        />
      </Logo>

      <Navigation role="navigation">
        <NavItem 
          href={DASHBOARD_ROUTES.HOME}
          active={router.pathname.startsWith('/dashboard')}
        >
          Dashboard
        </NavItem>
        <NavItem 
          href={VIRTUAL_CARE_ROUTES.HOME}
          active={router.pathname.startsWith('/virtual-care')}
        >
          Virtual Care
        </NavItem>
        <NavItem 
          href={HEALTH_RECORDS_ROUTES.HOME}
          active={router.pathname.startsWith('/health-records')}
        >
          Health Records
        </NavItem>
        <NavItem 
          href={CLAIMS_ROUTES.HOME}
          active={router.pathname.startsWith('/claims')}
        >
          Claims
        </NavItem>
        <NavItem 
          href={MARKETPLACE_ROUTES.HOME}
          active={router.pathname.startsWith('/marketplace')}
        >
          Marketplace
        </NavItem>
      </Navigation>

      <UserSection>
        {emergencyMode && (
          <EmergencyButton
            onClick={() => handleEmergencyNavigation(EMERGENCY_ROUTES.HOME, 'HIGH')}
            aria-label="Emergency access"
          >
            Emergency Mode
          </EmergencyButton>
        )}
        
        {user && (
          <>
            <NavItem 
              href={DASHBOARD_ROUTES.PROFILE}
              aria-label="User profile"
            >
              {user.profile.firstName} {user.profile.lastName}
            </NavItem>
            <NavItem 
              onClick={handleSecureLogout}
              role="button"
              aria-label="Logout"
            >
              Logout
            </NavItem>
          </>
        )}
      </UserSection>
    </StyledHeader>
  );
};

export default Header;
/**
 * @fileoverview Navigation sidebar component for AUSTA SuperApp web platform
 * Implements Material Design 3.0 principles with role-based access control
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  IconButton,
  Tooltip,
  Collapse,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  Dashboard as DashboardIcon,
  VideoCall as VideoCallIcon,
  HealthAndSafety as HealthRecordsIcon,
  Receipt as ClaimsIcon,
  Store as MarketplaceIcon,
  AdminPanelSettings as AdminIcon,
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon
} from '@mui/icons-material';

import {
  AUTH_ROUTES,
  DASHBOARD_ROUTES,
  VIRTUAL_CARE_ROUTES,
  HEALTH_RECORDS_ROUTES,
  CLAIMS_ROUTES,
  MARKETPLACE_ROUTES,
  ADMIN_ROUTES
} from '../../lib/constants/routes';

import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../lib/types/user';

// Constants
const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const TRANSITION_DURATION = '0.3s';

// Interfaces
interface NavigationItem {
  id: string;
  label: string;
  icon: JSX.Element;
  route: string;
  roles: UserRole[];
  children?: NavigationItem[];
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  width?: number;
}

// Styled Components
const SidebarContainer = styled.nav<{ isCollapsed: boolean; width: number }>`
  width: ${({ isCollapsed, width }) => (isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : width)}px;
  height: 100vh;
  background: ${({ theme }) => theme.palette.background.paper};
  border-right: 1px solid ${({ theme }) => theme.palette.divider};
  transition: width ${TRANSITION_DURATION} ease-in-out;
  overflow-x: hidden;
  overflow-y: auto;
  position: fixed;
  left: 0;
  top: 0;
  z-index: ${({ theme }) => theme.zIndex.drawer};
  
  /* Scrollbar styling */
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.palette.grey[300]};
    border-radius: 2px;
  }
`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: ${({ theme }) => theme.spacing(2)};
  min-height: 64px;
`;

const NavigationList = styled(List)`
  padding: ${({ theme }) => theme.spacing(1)};
`;

const NavigationItem = styled(ListItem)<{ active?: boolean }>`
  border-radius: ${({ theme }) => theme.shape.borderRadius}px;
  margin-bottom: ${({ theme }) => theme.spacing(0.5)};
  background-color: ${({ active, theme }) =>
    active ? theme.palette.action.selected : 'transparent'};
  
  &:hover {
    background-color: ${({ theme }) => theme.palette.action.hover};
  }
`;

// Navigation configuration
const getNavigationItems = (userRole: UserRole): NavigationItem[] => [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <DashboardIcon />,
    route: DASHBOARD_ROUTES.HOME,
    roles: [UserRole.PATIENT, UserRole.PROVIDER, UserRole.ADMIN, UserRole.INSURANCE]
  },
  {
    id: 'virtualCare',
    label: 'Virtual Care',
    icon: <VideoCallIcon />,
    route: VIRTUAL_CARE_ROUTES.HOME,
    roles: [UserRole.PATIENT, UserRole.PROVIDER],
    children: [
      {
        id: 'sessions',
        label: 'Sessions',
        icon: <VideoCallIcon />,
        route: VIRTUAL_CARE_ROUTES.SESSION,
        roles: [UserRole.PATIENT, UserRole.PROVIDER]
      }
    ]
  },
  {
    id: 'healthRecords',
    label: 'Health Records',
    icon: <HealthRecordsIcon />,
    route: HEALTH_RECORDS_ROUTES.HOME,
    roles: [UserRole.PATIENT, UserRole.PROVIDER],
    children: [
      {
        id: 'documents',
        label: 'Documents',
        icon: <HealthRecordsIcon />,
        route: HEALTH_RECORDS_ROUTES.DOCUMENTS,
        roles: [UserRole.PATIENT, UserRole.PROVIDER]
      }
    ]
  },
  {
    id: 'claims',
    label: 'Claims',
    icon: <ClaimsIcon />,
    route: CLAIMS_ROUTES.HOME,
    roles: [UserRole.PATIENT, UserRole.INSURANCE],
    children: [
      {
        id: 'submit',
        label: 'Submit Claim',
        icon: <ClaimsIcon />,
        route: CLAIMS_ROUTES.SUBMIT,
        roles: [UserRole.PATIENT]
      }
    ]
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    icon: <MarketplaceIcon />,
    route: MARKETPLACE_ROUTES.HOME,
    roles: [UserRole.PATIENT, UserRole.PROVIDER]
  },
  {
    id: 'admin',
    label: 'Admin Panel',
    icon: <AdminIcon />,
    route: ADMIN_ROUTES.DASHBOARD,
    roles: [UserRole.ADMIN]
  }
];

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggle,
  width = SIDEBAR_WIDTH
}) => {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Filter navigation items based on user role
  const navigationItems = user?.role
    ? getNavigationItems(user.role).filter(item => item.roles.includes(user.role))
    : [];

  // Check if route is active
  const isRouteActive = useCallback(
    (route: string): boolean => {
      const currentPath = router.pathname;
      if (route === currentPath) return true;
      if (route.includes('[') && currentPath.startsWith(route.split('[')[0])) return true;
      return false;
    },
    [router.pathname]
  );

  // Handle item expansion
  const handleExpand = (itemId: string) => {
    setExpandedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'b') {
        onToggle();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onToggle]);

  // Render navigation items recursively
  const renderNavigationItems = (items: NavigationItem[], level = 0) => {
    return items.map(item => (
      <div key={item.id}>
        <Tooltip
          title={isCollapsed ? item.label : ''}
          placement="right"
          arrow
        >
          <NavigationItem
            button
            active={isRouteActive(item.route)}
            onClick={() => item.children ? handleExpand(item.id) : router.push(item.route)}
            sx={{ pl: level * 2 }}
            aria-label={item.label}
            role="menuitem"
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              sx={{
                opacity: isCollapsed ? 0 : 1,
                transition: `opacity ${TRANSITION_DURATION} ease-in-out`
              }}
            />
            {item.children && !isCollapsed && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExpand(item.id);
                }}
                aria-label={`${expandedItems.includes(item.id) ? 'Collapse' : 'Expand'} ${item.label}`}
              >
                {expandedItems.includes(item.id) ? <CollapseIcon /> : <ExpandIcon />}
              </IconButton>
            )}
          </NavigationItem>
        </Tooltip>
        
        {item.children && (
          <Collapse in={expandedItems.includes(item.id) && !isCollapsed}>
            {renderNavigationItems(item.children, level + 1)}
          </Collapse>
        )}
      </div>
    ));
  };

  return (
    <SidebarContainer
      isCollapsed={isCollapsed}
      width={width}
      role="navigation"
      aria-label="Main navigation"
    >
      <SidebarHeader>
        <IconButton
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          edge="start"
          sx={{ ml: 1 }}
        >
          {isCollapsed ? <MenuIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </SidebarHeader>

      <NavigationList role="menu">
        {renderNavigationItems(navigationItems)}
      </NavigationList>
    </SidebarContainer>
  );
};

export default Sidebar;
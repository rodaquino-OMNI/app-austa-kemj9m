/**
 * @fileoverview Centralized routing constants for the AUSTA SuperApp web platform.
 * Defines all application routes and navigation paths following Next.js routing conventions.
 * @version 1.0.0
 */

/**
 * Authentication related route constants
 * Handles user authentication flows including login, registration, password management, and MFA
 */
export const AUTH_ROUTES = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  FORGOT_PASSWORD: '/auth/forgot-password',
  RESET_PASSWORD: '/auth/reset-password/[token]',
  VERIFY_EMAIL: '/auth/verify-email/[token]',
  MFA: '/auth/mfa',
  LOGOUT: '/auth/logout'
} as const;

/**
 * Dashboard related route constants
 * Main user interface routes for profile, settings, and notifications management
 */
export const DASHBOARD_ROUTES = {
  HOME: '/dashboard',
  PROFILE: '/dashboard/profile',
  SETTINGS: '/dashboard/settings',
  NOTIFICATIONS: '/dashboard/notifications',
  ACTIVITY: '/dashboard/activity',
  PREFERENCES: '/dashboard/preferences',
  SECURITY: '/dashboard/security'
} as const;

/**
 * Virtual care related route constants
 * Telemedicine features including video sessions, scheduling, and prescription management
 */
export const VIRTUAL_CARE_ROUTES = {
  HOME: '/virtual-care',
  SESSION: '/virtual-care/session/[sessionId]',
  HISTORY: '/virtual-care/history',
  SCHEDULE: '/virtual-care/schedule',
  PROVIDERS: '/virtual-care/providers',
  PRESCRIPTIONS: '/virtual-care/prescriptions',
  NOTES: '/virtual-care/notes/[sessionId]'
} as const;

/**
 * Health records related route constants
 * Medical data management including records, documents, and lab results
 */
export const HEALTH_RECORDS_ROUTES = {
  HOME: '/health-records',
  RECORD: '/health-records/record/[recordId]',
  UPLOAD: '/health-records/upload',
  SHARE: '/health-records/share',
  TIMELINE: '/health-records/timeline',
  DOCUMENTS: '/health-records/documents',
  LAB_RESULTS: '/health-records/lab-results',
  MEDICATIONS: '/health-records/medications'
} as const;

/**
 * Insurance claims related route constants
 * Claims processing, history, and reimbursement management
 */
export const CLAIMS_ROUTES = {
  HOME: '/claims',
  SUBMIT: '/claims/submit',
  DETAIL: '/claims/detail/[claimId]',
  HISTORY: '/claims/history',
  REIMBURSEMENT: '/claims/reimbursement',
  COVERAGE: '/claims/coverage',
  DOCUMENTS: '/claims/documents/[claimId]'
} as const;

/**
 * Marketplace related route constants
 * Digital health services marketplace including products, cart, and orders
 */
export const MARKETPLACE_ROUTES = {
  HOME: '/marketplace',
  PRODUCT: '/marketplace/product/[productId]',
  CATEGORY: '/marketplace/category/[categoryId]',
  CART: '/marketplace/cart',
  ORDERS: '/marketplace/orders',
  CHECKOUT: '/marketplace/checkout',
  WISHLIST: '/marketplace/wishlist'
} as const;

/**
 * Admin panel related route constants
 * Platform management including user management, analytics, and compliance
 */
export const ADMIN_ROUTES = {
  DASHBOARD: '/admin/dashboard',
  USERS: '/admin/users',
  USER_DETAIL: '/admin/users/[userId]',
  PROVIDERS: '/admin/providers',
  PROVIDER_DETAIL: '/admin/providers/[providerId]',
  ANALYTICS: '/admin/analytics',
  COMPLIANCE: '/admin/compliance',
  SETTINGS: '/admin/settings',
  LOGS: '/admin/logs',
  REPORTS: '/admin/reports'
} as const;

/**
 * Emergency related route constants
 * Emergency services and triage functionality
 */
export const EMERGENCY_ROUTES = {
  HOME: '/emergency',
  TRIAGE: '/emergency/triage',
  SERVICES: '/emergency/services',
  CONTACTS: '/emergency/contacts',
  NEAREST_FACILITY: '/emergency/nearest-facility',
  SOS: '/emergency/sos',
  FIRST_AID: '/emergency/first-aid'
} as const;

/**
 * Error handling route constants
 * System errors and maintenance pages
 */
export const ERROR_ROUTES = {
  NOT_FOUND: '/404',
  SERVER_ERROR: '/500',
  FORBIDDEN: '/403',
  MAINTENANCE: '/maintenance'
} as const;

// Type definitions for route parameters
export type DynamicRouteParams = {
  token?: string;
  sessionId?: string;
  recordId?: string;
  claimId?: string;
  productId?: string;
  categoryId?: string;
  userId?: string;
  providerId?: string;
};

// Ensure all routes are readonly
type ReadonlyRoutes<T> = {
  readonly [P in keyof T]: T[P];
};

// Export type-safe route constants
export type AuthRoutes = ReadonlyRoutes<typeof AUTH_ROUTES>;
export type DashboardRoutes = ReadonlyRoutes<typeof DASHBOARD_ROUTES>;
export type VirtualCareRoutes = ReadonlyRoutes<typeof VIRTUAL_CARE_ROUTES>;
export type HealthRecordsRoutes = ReadonlyRoutes<typeof HEALTH_RECORDS_ROUTES>;
export type ClaimsRoutes = ReadonlyRoutes<typeof CLAIMS_ROUTES>;
export type MarketplaceRoutes = ReadonlyRoutes<typeof MARKETPLACE_ROUTES>;
export type AdminRoutes = ReadonlyRoutes<typeof ADMIN_ROUTES>;
export type EmergencyRoutes = ReadonlyRoutes<typeof EMERGENCY_ROUTES>;
export type ErrorRoutes = ReadonlyRoutes<typeof ERROR_ROUTES>;
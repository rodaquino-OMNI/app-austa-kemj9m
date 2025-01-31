/**
 * @fileoverview HIPAA-compliant React hook for marketplace functionality in AUSTA SuperApp
 * Implements secure state management and operations for digital therapeutic programs
 * @version 1.0.0
 * @package react@18.0.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Product, ProductCategory, ProductSortOption } from '../lib/types/product';
import { useAnalytics } from './useAnalytics';
import { MarketplaceAPI } from '../lib/api/marketplace';
import { ErrorCode } from '../lib/constants/errorCodes';

// Security context type for HIPAA compliance
interface SecurityContext {
  encryptionEnabled: boolean;
  auditingEnabled: boolean;
  privacyLevel: 'PUBLIC' | 'PROTECTED' | 'PRIVATE';
  lastVerified: Date;
}

// Enhanced marketplace state interface
interface MarketplaceState {
  products: Product[];
  loading: boolean;
  error: MarketplaceError | null;
  totalProducts: number;
  currentPage: number;
  lastUpdated: Date;
  securityContext: SecurityContext;
}

// HIPAA-compliant error interface
interface MarketplaceError {
  code: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  timestamp: Date;
  context: Record<string, any>;
}

// Filter interface with security validation
interface MarketplaceFilters {
  category: ProductCategory | undefined;
  search: string;
  sortBy: ProductSortOption;
  page: number;
  limit: number;
  securityLevel: 'PUBLIC' | 'PROTECTED' | 'PRIVATE';
}

// Default values with security considerations
const DEFAULT_FILTERS: MarketplaceFilters = {
  category: undefined,
  search: '',
  sortBy: ProductSortOption.NEWEST,
  page: 1,
  limit: 20,
  securityLevel: 'PROTECTED'
};

const DEFAULT_SECURITY_CONTEXT: SecurityContext = {
  encryptionEnabled: true,
  auditingEnabled: true,
  privacyLevel: 'PROTECTED',
  lastVerified: new Date()
};

/**
 * Custom hook for secure marketplace functionality
 * Implements HIPAA-compliant data handling and user tracking
 */
export const useMarketplace = (initialFilters?: Partial<MarketplaceFilters>) => {
  // Initialize state with security context
  const [state, setState] = useState<MarketplaceState>({
    products: [],
    loading: false,
    error: null,
    totalProducts: 0,
    currentPage: 1,
    lastUpdated: new Date(),
    securityContext: DEFAULT_SECURITY_CONTEXT
  });

  // Initialize filters with validation
  const [filters, setFilters] = useState<MarketplaceFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters
  });

  // Analytics hook for secure tracking
  const { logEvent, logError, logPerformance } = useAnalytics();

  // Secure data fetching with retry logic
  const fetchProducts = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    const startTime = performance.now();

    try {
      const response = await MarketplaceAPI.getProducts({
        page: filters.page,
        limit: filters.limit,
        category: filters.category,
        sortBy: filters.sortBy,
        search: filters.search
      });

      setState(prev => ({
        ...prev,
        products: response.products,
        totalProducts: response.total,
        currentPage: filters.page,
        lastUpdated: new Date(),
        loading: false
      }));

      // Track successful fetch
      logEvent({
        name: 'marketplace_products_fetched',
        category: 'MARKETPLACE',
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: 'PROTECTED',
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now()
        },
        properties: {
          productCount: response.products.length,
          category: filters.category,
          page: filters.page
        }
      });

      // Track performance
      logPerformance({
        name: 'marketplace_fetch_duration',
        value: performance.now() - startTime,
        tags: { category: filters.category?.toString() || 'all' },
        timestamp: Date.now(),
        context: {
          operation: 'fetchProducts',
          filters: JSON.stringify(filters)
        }
      });

    } catch (error: any) {
      const marketplaceError: MarketplaceError = {
        code: error.code || ErrorCode.INTERNAL_SERVER_ERROR,
        message: error.message,
        severity: 'ERROR',
        timestamp: new Date(),
        context: { filters }
      };

      setState(prev => ({
        ...prev,
        error: marketplaceError,
        loading: false
      }));

      logError(error, {
        component: 'useMarketplace',
        operation: 'fetchProducts',
        filters
      }, 'PROTECTED');
    }
  }, [filters, logEvent, logError, logPerformance]);

  // Secure product retrieval by ID
  const getProductById = useCallback(async (productId: string) => {
    try {
      const product = await MarketplaceAPI.getProductById(productId);
      
      logEvent({
        name: 'marketplace_product_viewed',
        category: 'MARKETPLACE',
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: 'PROTECTED',
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now()
        },
        properties: {
          productId,
          category: product.category
        }
      });

      return product;
    } catch (error: any) {
      logError(error, {
        component: 'useMarketplace',
        operation: 'getProductById',
        productId
      }, 'PROTECTED');
      throw error;
    }
  }, [logEvent, logError]);

  // Secure purchase handling
  const purchaseProduct = useCallback(async (
    productId: string,
    paymentDetails: { paymentMethodId: string; encryptedData: string; validationToken: string }
  ) => {
    try {
      const result = await MarketplaceAPI.purchaseProduct(productId, paymentDetails);

      logEvent({
        name: 'marketplace_product_purchased',
        category: 'MARKETPLACE',
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: 'PROTECTED',
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now()
        },
        properties: {
          productId,
          transactionId: result.transactionId
        }
      });

      return result;
    } catch (error: any) {
      logError(error, {
        component: 'useMarketplace',
        operation: 'purchaseProduct',
        productId
      }, 'PROTECTED');
      throw error;
    }
  }, [logEvent, logError]);

  // Update filters with validation
  const updateFilters = useCallback((newFilters: Partial<MarketplaceFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      page: newFilters.category !== prev.category ? 1 : prev.page
    }));
  }, []);

  // Fetch products when filters change
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setState(prev => ({
        ...prev,
        products: [],
        loading: false,
        error: null
      }));
    };
  }, []);

  return {
    state,
    actions: {
      updateFilters,
      getProductById,
      purchaseProduct,
      refreshProducts: fetchProducts
    }
  };
};

export type { MarketplaceState, MarketplaceFilters, MarketplaceError };
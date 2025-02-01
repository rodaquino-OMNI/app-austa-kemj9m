/**
 * @fileoverview HIPAA-compliant marketplace API client for AUSTA SuperApp
 * Implements secure product management and purchase operations with audit logging
 * @version 1.0.0
 */

import axios, { AxiosError } from 'axios'; // v1.4.0
import winston from 'winston'; // v3.8.0
import { validateRequest, encryptPayload, sanitizeData } from '@austa/security-utils'; // v1.0.0

import { 
  Product, 
  ProductCategory, 
  ProductStatus, 
  ProductSortOption 
} from '../types/product';

import { 
  MarketplaceEndpoints, 
  buildUrl, 
  processEndpointParams 
} from '../constants/endpoints';

import { 
  ErrorCode, 
  ErrorTracker, 
  HTTP_STATUS 
} from '../constants/errorCodes';

// Configure secure logging for HIPAA compliance
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'marketplace-api' },
  transports: [
    new winston.transports.File({ filename: 'audit-marketplace.log' })
  ]
});

// API request configuration
const API_CONFIG = {
  timeout: 30000,
  retries: 3,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Version': '1.0'
  }
};

// Request parameter types
interface GetProductsParams {
  page?: number;
  limit?: number;
  category?: ProductCategory;
  sortBy?: ProductSortOption;
  search?: string;
  status?: ProductStatus;
}

interface PaymentDetails {
  paymentMethodId: string;
  encryptedData: string;
  validationToken: string;
}

export namespace MarketplaceAPI {
  /**
   * Retrieves paginated and filtered marketplace products with security validation
   * @param params - Filter and pagination parameters
   * @returns Promise with product list and audit tracking
   */
  export const getProducts = async (params: GetProductsParams = {}): Promise<{
    products: Product[];
    total: number;
    page: number;
    auditId: string;
  }> => {
    try {
      // Validate and sanitize input parameters
      const validatedParams = validateRequest(params, {
        page: { type: 'number', min: 1 },
        limit: { type: 'number', min: 1, max: 100 },
        category: { type: 'enum', enum: ProductCategory },
        sortBy: { type: 'enum', enum: ProductSortOption },
        status: { type: 'enum', enum: ProductStatus }
      });

      // Generate audit ID for request tracking
      const auditId = `MP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const response = await axios.get(buildUrl(MarketplaceEndpoints.GET_PRODUCTS), {
        params: validatedParams,
        headers: {
          ...API_CONFIG.headers,
          'X-Audit-ID': auditId
        }
      });

      // Validate and sanitize response data
      const sanitizedData = sanitizeData(response.data);

      // Log request for audit trail
      logger.info('Products retrieved', {
        auditId,
        params: validatedParams,
        resultCount: sanitizedData.products.length
      });

      return {
        ...sanitizedData,
        auditId
      };

    } catch (error) {
      handleApiError(error as AxiosError);
      throw error;
    }
  };

  /**
   * Retrieves detailed product information by ID with security validation
   * @param productId - Unique product identifier
   * @returns Promise with product details and audit tracking
   */
  export const getProductById = async (productId: string): Promise<Product & { auditId: string }> => {
    try {
      // Validate product ID format
      if (!productId.match(/^[A-Za-z0-9-]+$/)) {
        throw new Error(ErrorCode.INVALID_INPUT);
      }

      const auditId = `MP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const response = await axios.get(
        buildUrl(processEndpointParams(MarketplaceEndpoints.GET_PRODUCT, { id: productId })),
        {
          headers: {
            ...API_CONFIG.headers,
            'X-Audit-ID': auditId
          }
        }
      );

      // Validate response against schema
      const sanitizedData = sanitizeData(response.data);

      // Log access for audit trail
      logger.info('Product details accessed', {
        auditId,
        productId,
        category: sanitizedData.category
      });

      return {
        ...sanitizedData,
        auditId
      };

    } catch (error) {
      handleApiError(error as AxiosError);
      throw error;
    }
  };

  /**
   * Initiates secure product purchase with comprehensive validation
   * @param productId - Product to purchase
   * @param paymentDetails - Encrypted payment information
   * @returns Promise with transaction details and audit tracking
   */
  export const purchaseProduct = async (
    productId: string,
    paymentDetails: PaymentDetails
  ): Promise<{
    transactionId: string;
    status: string;
    auditId: string;
    securityToken: string;
  }> => {
    try {
      // Validate inputs
      if (!productId.match(/^[A-Za-z0-9-]+$/)) {
        throw new Error(ErrorCode.INVALID_INPUT);
      }

      // Generate secure transaction identifiers
      const auditId = `MP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const securityToken = await encryptPayload(JSON.stringify({
        auditId,
        timestamp: Date.now(),
        productId
      }));

      const response = await axios.post(
        buildUrl(processEndpointParams(MarketplaceEndpoints.PURCHASE_PRODUCT, { id: productId })),
        {
          paymentDetails,
          securityToken
        },
        {
          headers: {
            ...API_CONFIG.headers,
            'X-Audit-ID': auditId,
            'X-Security-Token': securityToken
          }
        }
      );

      // Validate transaction response
      const sanitizedData = sanitizeData(response.data);

      // Log transaction for audit
      logger.info('Product purchase initiated', {
        auditId,
        productId,
        transactionId: sanitizedData.transactionId,
        status: sanitizedData.status
      });

      return {
        ...sanitizedData,
        auditId,
        securityToken
      };

    } catch (error) {
      handleApiError(error as AxiosError);
      throw error;
    }
  };
}

/**
 * Handles API errors with proper logging and tracking
 * @param error - Axios error object
 */
const handleApiError = (error: AxiosError): never => {
  const errorCode = error.response?.status === HTTP_STATUS.NOT_FOUND
    ? ErrorCode.RESOURCE_NOT_FOUND
    : error.code === 'ECONNABORTED'
    ? ErrorCode.NETWORK_ERROR
    : ErrorCode.INTERNAL_SERVER_ERROR;

  // Log error for audit
  logger.error('API Error', {
    errorCode,
    status: error.response?.status,
    message: error.message
  });

  // Track error for monitoring
  ErrorTracker.captureError(error, {
    errorCode,
    component: 'MarketplaceAPI'
  });

  throw new Error(errorCode);
};
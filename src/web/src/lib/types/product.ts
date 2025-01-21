/**
 * @fileoverview TypeScript type definitions for marketplace products in the AUSTA SuperApp platform
 * @version 1.0.0
 * @package typescript@5.0.0
 */

// Maximum value constants for validation
export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_IMAGES = 10;
export const MIN_PRICE = 0;
export const MAX_RATING = 5;
export const MIN_RATING = 0;
export const MAX_SESSION_COUNT = 52;
export const MAX_TAGS = 20;

/**
 * Enumeration of available product categories in the marketplace
 */
export enum ProductCategory {
    DIGITAL_THERAPY = 'DIGITAL_THERAPY',
    WELLNESS_PROGRAM = 'WELLNESS_PROGRAM',
    PROVIDER_SERVICE = 'PROVIDER_SERVICE'
}

/**
 * Interface defining detailed product information
 */
export interface ProductDetails {
    /** Duration in minutes */
    duration: number;
    
    /** Delivery format (e.g., "Video", "Interactive", "Live Session") */
    format: string;
    
    /** List of prerequisites for the product */
    prerequisites: string[];
    
    /** Expected outcomes from using the product */
    outcomes: string[];
    
    /** Number of sessions included */
    sessionCount: number;
    
    /** Method of delivery (e.g., "Mobile", "Web", "In-Person") */
    deliveryMethod: string;
    
    /** Supported languages */
    languages: string[];
    
    /** Professional certifications and accreditations */
    certifications: string[];
}

/**
 * Main product interface representing items in the marketplace
 */
export interface Product {
    /** Unique identifier for the product */
    id: string;
    
    /** Product name (max 100 characters) */
    name: string;
    
    /** Detailed description (max 1000 characters) */
    description: string;
    
    /** Product category */
    category: ProductCategory;
    
    /** Price in smallest currency unit (e.g., cents) */
    price: number;
    
    /** ID of the healthcare provider offering the product */
    providerId: string;
    
    /** Array of image URLs (max 10 images) */
    images: string[];
    
    /** Detailed product information */
    details: ProductDetails;
    
    /** Creation timestamp */
    createdAt: Date;
    
    /** Last update timestamp */
    updatedAt: Date;
    
    /** Current product status */
    status: ProductStatus;
    
    /** Search and filter tags (max 20) */
    tags: string[];
    
    /** Average rating (0-5) */
    rating: number;
    
    /** Total number of reviews */
    reviewCount: number;
}

/**
 * Enumeration of product sorting options
 */
export enum ProductSortOption {
    PRICE_ASC = 'PRICE_ASC',
    PRICE_DESC = 'PRICE_DESC',
    NAME_ASC = 'NAME_ASC',
    NAME_DESC = 'NAME_DESC',
    NEWEST = 'NEWEST',
    RATING_DESC = 'RATING_DESC',
    POPULARITY = 'POPULARITY'
}

/**
 * Enumeration of possible product status values
 */
export enum ProductStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    PENDING_REVIEW = 'PENDING_REVIEW',
    SUSPENDED = 'SUSPENDED'
}
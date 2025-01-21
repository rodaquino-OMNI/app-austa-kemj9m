/**
 * @fileoverview Enhanced REST API controller for AUSTA SuperApp marketplace products
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, UseInterceptors, Req } from '@nestjs/common'; // v9.0.0
import { Request } from 'express'; // v4.18.2
import { IsString, IsNumber, IsEnum, Min, Max, ValidateNested } from 'class-validator'; // v0.14.0
import { Logger } from 'winston'; // v3.8.0
import { Cache } from 'cache-manager'; // v5.2.0
import { SecurityMiddleware, HIPAAGuard, RateLimit } from '@nestjs/security'; // v10.0.0

import { MarketplaceService } from '../services/marketplace.service';
import { ProductCategory } from '../config/marketplace.config';
import { IProduct } from '../models/product.model';
import { UserRole } from '../../../shared/interfaces/user.interface';

// Global constants
const CACHE_TTL = 1800; // 30 minutes
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const RATE_LIMIT_WINDOW = 900; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 1000;
const AUDIT_LOG_RETENTION_DAYS = 2555; // 7 years for HIPAA compliance

/**
 * DTO for creating a new product with validation
 */
class CreateProductDto {
    @IsString()
    @Length(1, 100)
    name: string;

    @IsString()
    @Length(1, 1000)
    description: string;

    @IsEnum(ProductCategory)
    category: ProductCategory;

    @IsNumber()
    @Min(0)
    price: number;

    @ValidateNested()
    details: {
        duration: number;
        format: string;
        clinicalValidation: {
            studyReferences: string[];
            evidenceLevel: string;
            validationDate: Date;
            validatedBy: string;
        };
        medicalPrerequisites: string[];
        contraindications: string[];
        clinicalOutcomes: Array<{
            metric: string;
            expectedOutcome: string;
            validationMethod: string;
        }>;
    };
}

/**
 * Enhanced REST API controller for marketplace products with HIPAA compliance
 */
@Controller('products')
@UseGuards(HIPAAGuard)
@UseInterceptors(CacheInterceptor)
@RateLimit({
    windowMs: RATE_LIMIT_WINDOW * 1000,
    max: RATE_LIMIT_MAX_REQUESTS
})
export class ProductsController {
    constructor(
        private readonly marketplaceService: MarketplaceService,
        private readonly logger: Logger,
        private readonly cacheManager: Cache,
        private readonly securityMiddleware: SecurityMiddleware
    ) {}

    /**
     * Create a new product with HIPAA compliance checks
     */
    @Post()
    @UseGuards(ProviderGuard)
    @ValidateBody(CreateProductDto)
    @Audit('product:create')
    async createProduct(
        @Req() req: Request,
        @Body() productData: CreateProductDto
    ): Promise<IProduct> {
        try {
            // Validate request correlation ID
            const correlationId = req.headers['x-correlation-id'];
            if (!correlationId) {
                throw new Error('Missing correlation ID');
            }

            // Extract and verify provider ID from authenticated user
            const providerId = req.user?.id;
            if (!providerId) {
                throw new Error('Invalid provider credentials');
            }

            // Validate provider ownership
            await this.marketplaceService.validateProductOwnership(providerId);

            // Create product with security context
            const product = await this.marketplaceService.createProduct(productData, providerId);

            // Invalidate relevant caches
            await this.cacheManager.del(`products:${providerId}`);
            await this.cacheManager.del(`products:category:${productData.category}`);

            // Log audit trail
            this.logger.info('Product created', {
                productId: product.id,
                providerId,
                correlationId,
                timestamp: new Date(),
                action: 'create',
                category: productData.category
            });

            return product;
        } catch (error) {
            this.logger.error('Product creation failed', {
                error: error.message,
                providerId: req.user?.id,
                correlationId: req.headers['x-correlation-id']
            });
            throw error;
        }
    }

    /**
     * Search products with enhanced caching and security
     */
    @Get('search')
    @RateLimit({ windowMs: 60000, max: 100 })
    async searchProducts(
        @Query('query') query: string,
        @Query('category') category?: ProductCategory,
        @Query('page') page: number = 0,
        @Query('limit') limit: number = DEFAULT_PAGE_SIZE
    ): Promise<{ items: IProduct[], total: number }> {
        // Validate and sanitize query parameters
        limit = Math.min(limit, MAX_PAGE_SIZE);
        page = Math.max(0, page);

        const cacheKey = `search:${query}:${category}:${page}:${limit}`;
        
        try {
            // Check cache first
            const cached = await this.cacheManager.get(cacheKey);
            if (cached) {
                return cached as { items: IProduct[], total: number };
            }

            // Perform search with security context
            const results = await this.marketplaceService.searchProducts({
                query,
                category,
                page,
                limit
            });

            // Cache results
            await this.cacheManager.set(cacheKey, results, CACHE_TTL);

            return results;
        } catch (error) {
            this.logger.error('Product search failed', {
                error: error.message,
                query,
                category
            });
            throw error;
        }
    }

    /**
     * Get products by category with caching
     */
    @Get('category/:category')
    async getProductsByCategory(
        @Param('category') category: ProductCategory
    ): Promise<IProduct[]> {
        const cacheKey = `products:category:${category}`;

        try {
            // Check cache first
            const cached = await this.cacheManager.get(cacheKey);
            if (cached) {
                return cached as IProduct[];
            }

            // Fetch products with security context
            const products = await this.marketplaceService.getProductsByCategory(category);

            // Cache results
            await this.cacheManager.set(cacheKey, products, CACHE_TTL);

            return products;
        } catch (error) {
            this.logger.error('Category fetch failed', {
                error: error.message,
                category
            });
            throw error;
        }
    }

    /**
     * Get products by provider with security checks
     */
    @Get('provider/:providerId')
    @UseGuards(ProviderGuard)
    async getProductsByProvider(
        @Param('providerId') providerId: string
    ): Promise<IProduct[]> {
        const cacheKey = `products:provider:${providerId}`;

        try {
            // Validate provider access
            await this.securityMiddleware.validateProviderAccess(providerId);

            // Check cache first
            const cached = await this.cacheManager.get(cacheKey);
            if (cached) {
                return cached as IProduct[];
            }

            // Fetch products with security context
            const products = await this.marketplaceService.getProductsByProvider(providerId);

            // Cache results
            await this.cacheManager.set(cacheKey, products, CACHE_TTL);

            return products;
        } catch (error) {
            this.logger.error('Provider products fetch failed', {
                error: error.message,
                providerId
            });
            throw error;
        }
    }
}
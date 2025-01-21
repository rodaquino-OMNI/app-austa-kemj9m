/**
 * @fileoverview Enhanced marketplace service configuration for AUSTA SuperApp
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { config } from 'dotenv'; // v16.0.0
import { UserRole } from '../../../shared/interfaces/user.interface';

// Initialize environment variables with validation
config();

/**
 * Product categories for marketplace organization
 */
export enum ProductCategory {
    DIGITAL_THERAPY = 'DIGITAL_THERAPY',
    WELLNESS_PROGRAM = 'WELLNESS_PROGRAM',
    PROVIDER_SERVICE = 'PROVIDER_SERVICE'
}

/**
 * Enhanced search configuration with field-specific boosting and analyzers
 */
class SearchConfig {
    readonly maxResults: number;
    readonly defaultPageSize: number;
    readonly searchFields: string[];
    readonly fieldBoosts: Record<string, number>;
    readonly analyzers: Record<string, any>;
    readonly queryTemplates: Record<string, any>;
    readonly scoreAdjustments: Record<string, number>;

    constructor(configOptions: any) {
        this.maxResults = configOptions.maxResults || 100;
        this.defaultPageSize = configOptions.defaultPageSize || 20;
        this.searchFields = [
            'name^3',
            'description^2',
            'category',
            'provider.name',
            'tags'
        ];
        this.fieldBoosts = {
            name: 3.0,
            description: 2.0,
            category: 1.5,
            'provider.name': 1.2
        };
        this.analyzers = {
            default: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'asciifolding', 'stop', 'snowball']
            }
        };
        this.queryTemplates = {
            multiMatch: {
                type: 'most_fields',
                operator: 'and',
                fuzziness: 'AUTO'
            }
        };
        this.scoreAdjustments = {
            popularityBoost: 1.2,
            ratingBoost: 1.5,
            availabilityBoost: 1.1
        };
    }
}

/**
 * Load and validate configuration with environment-specific optimizations
 */
const loadConfig = (environment: string) => {
    const config = {
        env: environment,
        elasticsearch: {
            node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
            auth: {
                username: process.env.ELASTICSEARCH_USERNAME,
                password: process.env.ELASTICSEARCH_PASSWORD
            },
            ssl: {
                rejectUnauthorized: environment === 'production'
            },
            maxRetries: 3,
            requestTimeout: 30000,
            sniffOnStart: true
        },
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
            keyPrefix: 'marketplace:',
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            showFriendlyErrorStack: environment !== 'production'
        },
        search: new SearchConfig({
            maxResults: parseInt(process.env.MAX_SEARCH_RESULTS || '100'),
            defaultPageSize: 20
        }),
        caching: {
            ttl: parseInt(process.env.CACHE_TTL || '3600'),
            warmupInterval: parseInt(process.env.CACHE_WARM_INTERVAL || '1800'),
            patterns: {
                products: 'products:*',
                categories: 'categories:*',
                providers: 'providers:*'
            }
        },
        validation: {
            product: {
                maxNameLength: parseInt(process.env.MAX_PRODUCT_NAME_LENGTH || '100'),
                maxDescriptionLength: parseInt(process.env.MAX_PRODUCT_DESCRIPTION_LENGTH || '1000'),
                maxImages: parseInt(process.env.MAX_PRODUCT_IMAGES || '10'),
                minPrice: parseInt(process.env.MIN_PRICE || '0'),
                allowedFormats: ['jpg', 'png', 'webp']
            }
        },
        provider: {
            role: UserRole.PROVIDER,
            verificationTimeout: parseInt(process.env.PROVIDER_VERIFICATION_TIMEOUT || '7200'),
            requiredDocuments: ['license', 'certification', 'insurance'],
            maxBulkOperations: parseInt(process.env.MAX_BULK_OPERATIONS || '1000')
        },
        security: {
            rateLimit: {
                window: 900,
                max: 1000
            },
            inputValidation: {
                sanitize: true,
                escape: true
            },
            scoreThreshold: parseFloat(process.env.SEARCH_SCORE_THRESHOLD || '0.5')
        },
        monitoring: {
            metrics: {
                enabled: true,
                interval: 60000
            },
            healthCheck: {
                enabled: true,
                interval: 30000
            }
        }
    };

    return config;
};

/**
 * Export enhanced marketplace configuration
 */
export const marketplaceConfig = loadConfig(process.env.NODE_ENV || 'development');
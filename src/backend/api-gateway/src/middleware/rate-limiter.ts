/**
 * @fileoverview Advanced Rate Limiting Middleware
 * Implements sliding window rate limiting with Redis cluster support for the AUSTA SuperApp API Gateway.
 * Provides sophisticated request throttling with user type differentiation and graceful degradation.
 * 
 * @version 1.0.0
 */

import Redis from 'ioredis'; // v5.3.2
import { Request, Response, NextFunction } from 'express'; // v4.18.2
import CircuitBreaker from 'circuit-breaker-js'; // v0.0.3
import { createLogger, format, transports } from 'winston'; // v3.8.2
import { HttpStatus } from '../../../shared/constants/http-status';
import { kongConfig } from '../config/kong.config';

// Configure logging
const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'rate-limiter.log' })
  ]
});

// Type definitions
type UserType = 'standard' | 'premium';

interface RateLimiterConfig {
  redis: {
    nodes: Array<{ host: string; port: number }>;
    options: {
      clusterRetryStrategy: (times: number) => number;
      enableReadyCheck: boolean;
      maxRedirections: number;
    };
  };
  limits: {
    standard: number;
    premium: number;
  };
  windowMs: number;
  fallbackStrategy: 'STRICT' | 'PERMISSIVE';
  circuitBreaker: {
    timeout: number;
    resetTimeout: number;
    errorThreshold: number;
  };
}

interface RateLimitResult {
  limited: boolean;
  remaining: number;
  reset: number;
  total: number;
}

interface SlidingWindow {
  count: number;
  timestamp: number;
}

/**
 * Rate Limiter class implementing sliding window algorithm with Redis cluster support
 */
class RateLimiter {
  private redisCluster: Redis.Cluster;
  private redisBreaker: any;
  private config: RateLimiterConfig;
  private localCounters: Map<string, SlidingWindow>;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.localCounters = new Map();

    // Initialize Redis cluster
    this.redisCluster = new Redis.Cluster(config.redis.nodes, {
      ...config.redis.options,
      clusterRetryStrategy: (times) => {
        return Math.min(times * 100, 3000);
      }
    });

    // Initialize circuit breaker
    this.redisBreaker = new CircuitBreaker({
      windowDuration: config.circuitBreaker.timeout,
      numBuckets: 10,
      timeoutDuration: config.circuitBreaker.resetTimeout,
      errorThreshold: config.circuitBreaker.errorThreshold,
      volumeThreshold: 10
    });

    // Set up health check interval
    setInterval(() => this.healthCheck(), 30000);
  }

  /**
   * Checks rate limit for a client using sliding window algorithm
   */
  private async checkLimit(clientId: string, userType: UserType): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const limit = userType === 'premium' ? this.config.limits.premium : this.config.limits.standard;

    try {
      return await this.redisBreaker.run(async () => {
        const key = `ratelimit:${clientId}:${Math.floor(now / this.config.windowMs)}`;
        const prevKey = `ratelimit:${clientId}:${Math.floor(windowStart / this.config.windowMs)}`;

        const multi = this.redisCluster.multi();
        multi.get(key);
        multi.get(prevKey);
        const [current, previous] = await multi.exec();

        const currentCount = parseInt(current?.[1] as string || '0');
        const previousCount = parseInt(previous?.[1] as string || '0');

        const weightedPrevious = previousCount * ((this.config.windowMs - (now % this.config.windowMs)) / this.config.windowMs);
        const count = Math.floor(weightedPrevious + currentCount);

        if (count >= limit) {
          return {
            limited: true,
            remaining: 0,
            reset: Math.ceil((now + this.config.windowMs) / 1000),
            total: limit
          };
        }

        await this.redisCluster.incr(key);
        await this.redisCluster.expire(key, Math.ceil(this.config.windowMs / 1000));

        return {
          limited: false,
          remaining: limit - count - 1,
          reset: Math.ceil((now + this.config.windowMs) / 1000),
          total: limit
        };
      });
    } catch (error) {
      logger.warn('Redis operation failed, falling back to local counter', { clientId, error });
      return this.checkLocalLimit(clientId, userType, now);
    }
  }

  /**
   * Fallback to local counting when Redis is unavailable
   */
  private checkLocalLimit(clientId: string, userType: UserType, now: number): RateLimitResult {
    const window = this.localCounters.get(clientId) || { count: 0, timestamp: now };
    const limit = userType === 'premium' ? this.config.limits.premium : this.config.limits.standard;

    // Reset window if expired
    if (now - window.timestamp >= this.config.windowMs) {
      window.count = 0;
      window.timestamp = now;
    }

    if (window.count >= limit) {
      return {
        limited: true,
        remaining: 0,
        reset: Math.ceil((window.timestamp + this.config.windowMs) / 1000),
        total: limit
      };
    }

    window.count++;
    this.localCounters.set(clientId, window);

    return {
      limited: false,
      remaining: limit - window.count,
      reset: Math.ceil((window.timestamp + this.config.windowMs) / 1000),
      total: limit
    };
  }

  /**
   * Performs health check on Redis cluster
   */
  private async healthCheck() {
    try {
      await this.redisCluster.ping();
      logger.info('Redis health check passed');
    } catch (error) {
      logger.error('Redis health check failed', { error });
    }
  }

  /**
   * Cleanup resources on shutdown
   */
  public async cleanup(): Promise<void> {
    try {
      await this.redisCluster.quit();
      this.localCounters.clear();
      logger.info('Rate limiter cleanup completed');
    } catch (error) {
      logger.error('Rate limiter cleanup failed', { error });
    }
  }
}

/**
 * Creates rate limiter middleware instance
 */
export default function createRateLimiter(config: RateLimiterConfig) {
  const rateLimiter = new RateLimiter(config);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    await rateLimiter.cleanup();
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientId = req.user?.id || req.ip;
      const userType = req.user?.type === 'premium' ? 'premium' : 'standard';

      const result = await rateLimiter.checkLimit(clientId, userType);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': result.total.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.reset.toString()
      });

      if (result.limited) {
        logger.warn('Rate limit exceeded', { 
          clientId, 
          userType,
          path: req.path,
          method: req.method 
        });
        
        return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
          error: 'Too many requests',
          retryAfter: result.reset - Math.floor(Date.now() / 1000)
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error', { error });
      
      if (config.fallbackStrategy === 'PERMISSIVE') {
        next();
      } else {
        res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          error: 'Rate limiting service unavailable'
        });
      }
    }
  };
}
package com.austa.superapp.core.di

import android.content.Context
import com.austa.superapp.core.constants.AppConstants.NETWORK
import com.austa.superapp.core.network.ApiClient
import com.austa.superapp.core.network.NetworkConfig
import com.austa.superapp.core.network.NetworkMonitor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.CertificatePinner
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

/**
 * Dagger Hilt module providing network-related dependencies with enhanced security,
 * monitoring, and resilience features for the AUSTA SuperApp.
 * Version: 1.0.0
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private const val NETWORK_TIMEOUT_SECONDS = 30L
    private const val MAX_RETRIES = 3
    private const val BACKOFF_DURATION_MS = 1000L
    private const val CIRCUIT_BREAKER_THRESHOLD = 5
    private const val RATE_LIMIT_PER_SECOND = 50
    private const val CONNECTION_POOL_SIZE = 5
    private const val KEEP_ALIVE_DURATION_MS = 5000L

    /**
     * Provides NetworkConfig instance with optimized settings for healthcare data transmission
     */
    @Provides
    @Singleton
    fun provideNetworkConfig(): NetworkConfig = NetworkConfig(
        enableQualityMonitoring = true,
        qualityCheckInterval = 5000L,
        maxRecoveryAttempts = MAX_RETRIES,
        connectionPoolSize = CONNECTION_POOL_SIZE
    )

    /**
     * Provides NetworkMonitor instance with enhanced quality metrics and resilience
     */
    @Provides
    @Singleton
    fun provideNetworkMonitor(
        @ApplicationContext context: Context,
        networkConfig: NetworkConfig
    ): NetworkMonitor = NetworkMonitor(context, networkConfig).apply {
        startMonitoring()
    }

    /**
     * Provides enhanced OkHttpClient with security features and performance optimization
     */
    @Provides
    @Singleton
    fun provideOkHttpClient(
        networkConfig: NetworkConfig,
        networkMonitor: NetworkMonitor
    ): OkHttpClient {
        val certificatePinner = CertificatePinner.Builder()
            .add(NETWORK.BASE_URL, "sha256/...") // Add production certificate pins
            .build()

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        return OkHttpClient.Builder().apply {
            // Timeouts and connection settings
            connectTimeout(NETWORK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            readTimeout(NETWORK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            writeTimeout(NETWORK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            
            // Connection pooling
            connectionPool(ConnectionPool(
                CONNECTION_POOL_SIZE,
                KEEP_ALIVE_DURATION_MS,
                TimeUnit.MILLISECONDS
            ))

            // Security configurations
            certificatePinner(certificatePinner)
            followSslRedirects(false)
            followRedirects(false)

            // Network quality monitoring
            addInterceptor { chain ->
                if (!networkMonitor.isNetworkAvailable.value) {
                    throw NoNetworkException("No network connection available")
                }
                chain.proceed(chain.request())
            }

            // Rate limiting
            addInterceptor(RateLimitInterceptor(RATE_LIMIT_PER_SECOND))

            // Circuit breaker
            addInterceptor(CircuitBreakerInterceptor(
                threshold = CIRCUIT_BREAKER_THRESHOLD,
                resetTimeoutMs = BACKOFF_DURATION_MS
            ))

            // Retry mechanism with exponential backoff
            addInterceptor(RetryInterceptor(
                maxRetries = MAX_RETRIES,
                baseBackoffMs = BACKOFF_DURATION_MS
            ))

            // Logging and monitoring
            addInterceptor(loggingInterceptor)
            addInterceptor(NetworkMetricsInterceptor())

            // Compression
            if (NETWORK.COMPRESSION_ENABLED) {
                addInterceptor(GzipRequestInterceptor())
            }
        }.build()
    }

    /**
     * Provides Retrofit instance with enhanced resilience patterns
     */
    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit {
        return Retrofit.Builder()
            .baseUrl(NETWORK.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create())
            .addCallAdapterFactory(CoroutineCallAdapterFactory())
            .build()
    }

    /**
     * Provides ApiClient instance with comprehensive security features
     */
    @Provides
    @Singleton
    fun provideApiClient(
        @ApplicationContext context: Context,
        retrofit: Retrofit
    ): ApiClient = ApiClient.getInstance(context).apply {
        configureResilience(
            maxRetries = MAX_RETRIES,
            backoffDurationMs = BACKOFF_DURATION_MS,
            circuitBreakerThreshold = CIRCUIT_BREAKER_THRESHOLD
        )
    }
}

/**
 * Custom exceptions and interceptors for enhanced network handling
 */
class NoNetworkException(message: String) : IOException(message)

class RateLimitInterceptor(private val requestsPerSecond: Int) : Interceptor {
    private val rateLimiter = RateLimiter.create(requestsPerSecond.toDouble())

    override fun intercept(chain: Interceptor.Chain): Response {
        rateLimiter.acquire()
        return chain.proceed(chain.request())
    }
}

class CircuitBreakerInterceptor(
    private val threshold: Int,
    private val resetTimeoutMs: Long
) : Interceptor {
    private val failureCount = AtomicInteger(0)
    private val lastFailureTime = AtomicLong(0)

    override fun intercept(chain: Interceptor.Chain): Response {
        if (isCircuitOpen()) {
            throw CircuitBreakerException("Circuit breaker is open")
        }
        
        try {
            val response = chain.proceed(chain.request())
            if (response.isSuccessful) {
                failureCount.set(0)
            } else {
                handleFailure()
            }
            return response
        } catch (e: Exception) {
            handleFailure()
            throw e
        }
    }

    private fun isCircuitOpen(): Boolean {
        if (failureCount.get() >= threshold) {
            val timeSinceLastFailure = System.currentTimeMillis() - lastFailureTime.get()
            return timeSinceLastFailure < resetTimeoutMs
        }
        return false
    }

    private fun handleFailure() {
        failureCount.incrementAndGet()
        lastFailureTime.set(System.currentTimeMillis())
    }
}

class CircuitBreakerException(message: String) : IOException(message)
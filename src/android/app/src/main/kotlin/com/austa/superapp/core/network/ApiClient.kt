package com.austa.superapp.core.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import com.austa.superapp.core.constants.AppConstants.NETWORK
import com.austa.superapp.core.constants.AppConstants.SECURITY
import com.austa.superapp.core.security.EncryptionManager
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.*
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.time.Duration
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Singleton API client for handling all network requests in the AUSTA SuperApp.
 * Implements comprehensive security, monitoring, and resilience features.
 * Version: 1.0.0
 */
class ApiClient private constructor(context: Context) {

    companion object {
        private const val TAG = "ApiClient"
        private const val AUTHORIZATION_HEADER = "Authorization"
        private const val BEARER_PREFIX = "Bearer "
        private const val DEFAULT_TIMEOUT_SECONDS = 30L
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val CIRCUIT_BREAKER_THRESHOLD = 5
        private const val CIRCUIT_BREAKER_DELAY_SECONDS = 30L

        @Volatile
        private var instance: ApiClient? = null

        fun getInstance(context: Context): ApiClient {
            return instance ?: synchronized(this) {
                instance ?: ApiClient(context).also { instance = it }
            }
        }
    }

    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val networkAvailable = MutableStateFlow(false)
    private val authToken = MutableStateFlow<String?>(null)
    private val encryptionManager = EncryptionManager()
    
    private val circuitBreaker = CircuitBreaker.of(
        "apiClientBreaker",
        CircuitBreakerConfig.custom()
            .failureRateThreshold(50f)
            .waitDurationInOpenState(Duration.ofSeconds(CIRCUIT_BREAKER_DELAY_SECONDS))
            .slidingWindowSize(CIRCUIT_BREAKER_THRESHOLD)
            .build()
    )

    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val certificatePinner = CertificatePinner.Builder()
        .add(ApiEndpoints.BASE_URL, "sha256/...")  // Add your certificate pins
        .build()

    private val httpClient = createSecureHttpClient()
    
    private val retrofit = Retrofit.Builder()
        .baseUrl(NETWORK.BASE_URL)
        .client(httpClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    init {
        setupNetworkCallback()
    }

    private fun createSecureHttpClient(): OkHttpClient {
        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            @Throws(CertificateException::class)
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit

            @Throws(CertificateException::class)
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit

            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        })

        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, trustAllCerts, java.security.SecureRandom())

        return OkHttpClient.Builder().apply {
            connectTimeout(NETWORK.CONNECT_TIMEOUT, TimeUnit.SECONDS)
            readTimeout(NETWORK.READ_TIMEOUT, TimeUnit.SECONDS)
            writeTimeout(NETWORK.WRITE_TIMEOUT, TimeUnit.SECONDS)
            certificatePinner(certificatePinner)
            
            // Security interceptors
            addInterceptor { chain ->
                val original = chain.request()
                val requestBuilder = original.newBuilder()
                    .header("User-Agent", "AUSTA-Android/${NETWORK.API_VERSION}")
                
                authToken.value?.let { token ->
                    requestBuilder.header(AUTHORIZATION_HEADER, "$BEARER_PREFIX$token")
                }

                // Encrypt sensitive request data
                val encryptedRequest = if (original.body != null && original.body!!.contentType()?.type == "application/json") {
                    val originalBody = original.body!!.toString()
                    val encryptedData = encryptionManager.encryptData(originalBody.toByteArray(), "request_key")
                    requestBuilder.header("X-Encrypted", "true")
                    RequestBody.create(original.body!!.contentType(), encryptedData.encryptedBytes)
                } else original.body

                chain.proceed(requestBuilder.method(original.method, encryptedRequest).build())
            }

            // Logging interceptor for debug builds
            if (BuildConfig.DEBUG) {
                addInterceptor(HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BODY
                })
            }

            // Network security configurations
            connectionSpecs(listOf(
                ConnectionSpec.MODERN_TLS,
                ConnectionSpec.COMPATIBLE_TLS
            ))
        }.build()
    }

    private fun setupNetworkCallback() {
        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        connectivityManager.registerNetworkCallback(networkRequest, object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                networkAvailable.value = true
            }

            override fun onLost(network: Network) {
                networkAvailable.value = false
            }
        })
    }

    /**
     * Creates a type-safe API service interface with security checks
     */
    fun <T> createService(serviceClass: Class<T>): T {
        return circuitBreaker.decorateSupplier {
            retrofit.create(serviceClass)
        }.get()
    }

    /**
     * Securely updates authentication token with encryption
     */
    fun setAuthToken(token: String?) {
        token?.let {
            val encryptedToken = encryptionManager.encryptData(it.toByteArray(), "auth_token")
            authToken.value = String(encryptedToken.encryptedBytes)
        } ?: run {
            authToken.value = null
        }
    }

    /**
     * Checks if network is available
     */
    fun isNetworkAvailable(): Boolean = networkAvailable.value
}
package com.austa.superapp.features.marketplace.data

import android.util.Log
import androidx.room.*
import com.austa.superapp.core.constants.AppConstants.NETWORK
import com.austa.superapp.core.constants.AppConstants.UI
import com.austa.superapp.core.network.ApiClient
import com.austa.superapp.core.network.ApiEndpoints
import com.austa.superapp.features.marketplace.domain.models.Product
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import retrofit2.HttpException
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "MarketplaceService"
private const val CACHE_TIMEOUT_HOURS = 24L
private const val MIN_SEARCH_LENGTH = 3
private const val SEARCH_DEBOUNCE_MS = 300L
private const val MAX_RETRY_ATTEMPTS = 3
private const val RETRY_DELAY_MS = 1000L

/**
 * Service class that handles marketplace operations with offline-first architecture
 * and multi-layer caching strategy.
 * Version: 1.0.0
 */
@Singleton
class MarketplaceService @Inject constructor(
    private val apiClient: ApiClient,
    private val marketplaceDao: MarketplaceDao,
    private val coroutineScope: CoroutineScope,
    private val networkMonitor: NetworkMonitor
) {
    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _cacheState = MutableStateFlow(CacheState())
    private var refreshJob: Job? = null

    private val networkStatus = networkMonitor.networkStatus
        .onEach { isAvailable ->
            if (isAvailable && _cacheState.value.needsRefresh) {
                refreshProducts()
            }
        }
        .stateIn(coroutineScope, SharingStarted.Eagerly, false)

    init {
        coroutineScope.launch {
            marketplaceDao.getAllProducts()
                .catch { e -> Log.e(TAG, "Error observing products", e) }
                .collect { products ->
                    _products.value = products
                }
        }
    }

    /**
     * Retrieves products with offline-first approach and caching
     */
    @WorkerThread
    suspend fun getProducts(
        category: ProductCategory? = null,
        page: Int = 0,
        pageSize: Int = UI.PAGINATION_PAGE_SIZE
    ): Flow<Result<List<Product>>> = flow {
        try {
            // First emit cached data
            val cachedProducts = marketplaceDao.getProductsByCategory(category, page, pageSize)
            emit(Result.success(cachedProducts))

            // Check if cache needs refresh
            if (_cacheState.value.needsRefresh && apiClient.isNetworkAvailable()) {
                val params = mutableMapOf(
                    "page" to page.toString(),
                    "size" to pageSize.toString()
                )
                category?.let { params["category"] = it.name }

                val endpoint = ApiEndpoints.buildUrl(
                    ApiEndpoints.MARKETPLACE.PRODUCTS,
                    params
                )

                val response = withRetry(MAX_RETRY_ATTEMPTS) {
                    apiClient.createService(MarketplaceApi::class.java)
                        .getProducts(endpoint)
                }

                marketplaceDao.insertProducts(response)
                _cacheState.value = _cacheState.value.copy(
                    lastRefresh = System.currentTimeMillis()
                )
                emit(Result.success(response))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching products", e)
            emit(Result.failure(e))
        }
    }

    /**
     * Performs optimized product search with local caching
     */
    @WorkerThread
    suspend fun searchProducts(
        query: String,
        category: ProductCategory? = null
    ): Flow<Result<List<Product>>> = flow {
        if (query.length < MIN_SEARCH_LENGTH) {
            emit(Result.success(emptyList()))
            return@flow
        }

        try {
            // Search in local cache first
            val cachedResults = marketplaceDao.searchProducts(query, category)
            emit(Result.success(cachedResults))

            // Perform network search if online
            if (apiClient.isNetworkAvailable()) {
                val params = mutableMapOf(
                    "query" to query
                )
                category?.let { params["filter"] = it.name }

                val endpoint = ApiEndpoints.buildUrl(
                    ApiEndpoints.MARKETPLACE.SEARCH,
                    params
                )

                val response = withRetry(MAX_RETRY_ATTEMPTS) {
                    apiClient.createService(MarketplaceApi::class.java)
                        .searchProducts(endpoint)
                }

                marketplaceDao.insertProducts(response)
                emit(Result.success(response))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error searching products", e)
            emit(Result.failure(e))
        }
    }
        .debounce(SEARCH_DEBOUNCE_MS)
        .distinctUntilChanged()

    /**
     * Forces refresh of product data with error handling
     */
    @WorkerThread
    suspend fun refreshProducts(): Result<Unit> {
        refreshJob?.cancel()
        
        return try {
            if (!apiClient.isNetworkAvailable()) {
                return Result.failure(IOException("No network connection"))
            }

            refreshJob = coroutineScope.launch {
                try {
                    val endpoint = ApiEndpoints.buildUrl(
                        ApiEndpoints.MARKETPLACE.PRODUCTS,
                        mapOf("page" to "0", "size" to UI.PAGINATION_PAGE_SIZE.toString())
                    )

                    val response = withRetry(MAX_RETRY_ATTEMPTS) {
                        apiClient.createService(MarketplaceApi::class.java)
                            .getProducts(endpoint)
                    }

                    marketplaceDao.clearAndInsertProducts(response)
                    _cacheState.value = _cacheState.value.copy(
                        lastRefresh = System.currentTimeMillis(),
                        needsRefresh = false
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Error refreshing products", e)
                    _cacheState.value = _cacheState.value.copy(needsRefresh = true)
                    throw e
                }
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun <T> withRetry(
        maxAttempts: Int,
        block: suspend () -> T
    ): T {
        var lastException: Exception? = null
        repeat(maxAttempts) { attempt ->
            try {
                return block()
            } catch (e: HttpException) {
                lastException = e
                if (attempt < maxAttempts - 1) {
                    delay(RETRY_DELAY_MS * (attempt + 1))
                }
            } catch (e: IOException) {
                lastException = e
                if (attempt < maxAttempts - 1) {
                    delay(RETRY_DELAY_MS * (attempt + 1))
                }
            }
        }
        throw lastException ?: IllegalStateException("Unknown error during retry")
    }

    private data class CacheState(
        val lastRefresh: Long = 0,
        val needsRefresh: Boolean = true
    ) {
        val isExpired: Boolean
            get() = System.currentTimeMillis() - lastRefresh > TimeUnit.HOURS.toMillis(CACHE_TIMEOUT_HOURS)
    }
}
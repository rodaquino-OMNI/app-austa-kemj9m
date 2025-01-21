package com.austa.superapp.features.marketplace.data

import com.austa.superapp.features.marketplace.domain.models.Product
import com.austa.superapp.features.marketplace.domain.models.ProductCategory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

// External library versions:
// kotlinx.coroutines:1.7.3
// javax.inject:1
// timber:5.0.1

/**
 * Repository implementation for marketplace operations with enhanced caching and offline support.
 * Provides thread-safe access to marketplace data with proper error handling and retry mechanisms.
 */
@Singleton
class MarketplaceRepository @Inject constructor(
    private val marketplaceService: MarketplaceService,
    private val coroutineScope: CoroutineScope
) {
    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _cacheState = MutableStateFlow(CacheState())
    private var refreshJob: Job? = null

    private val searchCache = LruCache<String, List<Product>>(SEARCH_CACHE_SIZE)

    init {
        setupInitialDataLoad()
        setupPeriodicRefresh()
    }

    /**
     * Retrieves products with enhanced caching and offline support
     * @param category Optional category filter
     * @param page Pagination page number
     * @param forceRefresh Force network refresh
     * @return Flow of product results with error handling
     */
    fun getProducts(
        category: ProductCategory? = null,
        page: Int = 0,
        forceRefresh: Boolean = false
    ): Flow<Result<List<Product>>> = flow {
        try {
            // Check cache first
            if (!forceRefresh && !_cacheState.value.isExpired) {
                val cachedProducts = _products.value
                    .filter { product -> category == null || product.category == category }
                    .drop(page * DEFAULT_PAGE_SIZE)
                    .take(DEFAULT_PAGE_SIZE)
                emit(Result.success(cachedProducts))
                
                if (cachedProducts.isNotEmpty()) {
                    return@flow
                }
            }

            // Fetch from network
            marketplaceService.getProducts(category, page)
                .catch { e ->
                    Timber.e(e, "Error fetching products from network")
                    emit(Result.failure(e))
                }
                .collect { products ->
                    _products.update { currentList ->
                        if (page == 0) products
                        else (currentList + products).distinctBy { it.id }
                    }
                    _cacheState.update { it.copy(
                        lastRefresh = System.currentTimeMillis(),
                        isExpired = false
                    )}
                    emit(Result.success(products))
                }

        } catch (e: Exception) {
            Timber.e(e, "Error in getProducts")
            emit(Result.failure(e))
        }
    }

    /**
     * Performs optimized product search with caching
     * @param query Search query string
     * @param category Optional category filter
     * @param options Search configuration options
     * @return Flow of search results with error handling
     */
    fun searchProducts(
        query: String,
        category: ProductCategory? = null,
        options: SearchOptions = SearchOptions()
    ): Flow<Result<List<Product>>> = flow {
        try {
            if (query.length < MIN_SEARCH_QUERY_LENGTH) {
                emit(Result.success(emptyList()))
                return@flow
            }

            // Check search cache
            val cacheKey = "${query}_${category?.name}"
            searchCache.get(cacheKey)?.let { cachedResults ->
                emit(Result.success(cachedResults))
                if (!options.forceRefresh) {
                    return@flow
                }
            }

            // Perform network search
            marketplaceService.searchProducts(query, category)
                .catch { e ->
                    Timber.e(e, "Error searching products from network")
                    emit(Result.failure(e))
                }
                .collect { results ->
                    // Apply search ranking if specified
                    val rankedResults = if (options.enableRanking) {
                        rankSearchResults(results, query)
                    } else results

                    // Cache search results
                    searchCache.put(cacheKey, rankedResults)
                    emit(Result.success(rankedResults))
                }

        } catch (e: Exception) {
            Timber.e(e, "Error in searchProducts")
            emit(Result.failure(e))
        }
    }

    /**
     * Forces refresh of marketplace data
     * @return Result indicating success or failure
     */
    suspend fun refreshProducts(): Result<Unit> {
        return try {
            refreshJob?.cancel()
            refreshJob = coroutineScope.launch {
                try {
                    marketplaceService.refreshProducts()
                    _cacheState.update { it.copy(
                        lastRefresh = System.currentTimeMillis(),
                        isExpired = false
                    )}
                    Timber.d("Products refreshed successfully")
                } catch (e: Exception) {
                    Timber.e(e, "Error refreshing products")
                    _cacheState.update { it.copy(isExpired = true) }
                    throw e
                }
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun setupInitialDataLoad() {
        coroutineScope.launch {
            try {
                marketplaceService.getProducts()
                    .catch { e -> Timber.e(e, "Initial data load failed") }
                    .collect { products ->
                        _products.value = products
                        _cacheState.value = CacheState(
                            lastRefresh = System.currentTimeMillis(),
                            isExpired = false
                        )
                    }
            } catch (e: Exception) {
                Timber.e(e, "Error in initial data load")
            }
        }
    }

    private fun setupPeriodicRefresh() {
        coroutineScope.launch {
            while (true) {
                kotlinx.coroutines.delay(TimeUnit.MINUTES.toMillis(BACKGROUND_REFRESH_INTERVAL))
                try {
                    refreshProducts()
                } catch (e: Exception) {
                    Timber.e(e, "Periodic refresh failed")
                }
            }
        }
    }

    private fun rankSearchResults(results: List<Product>, query: String): List<Product> {
        return results.sortedByDescending { product ->
            var score = 0
            // Exact name match gets highest score
            if (product.name.equals(query, ignoreCase = true)) score += 100
            // Partial name match
            else if (product.name.contains(query, ignoreCase = true)) score += 50
            // Category match
            if (product.category.name.contains(query, ignoreCase = true)) score += 25
            score
        }
    }

    private data class CacheState(
        val lastRefresh: Long = 0,
        val isExpired: Boolean = true
    ) {
        fun isStale(): Boolean = 
            System.currentTimeMillis() - lastRefresh > TimeUnit.MINUTES.toMillis(CACHE_TIMEOUT_MINUTES)
    }

    data class SearchOptions(
        val forceRefresh: Boolean = false,
        val enableRanking: Boolean = true,
        val maxResults: Int = DEFAULT_PAGE_SIZE
    )

    companion object {
        private const val DEFAULT_PAGE_SIZE = 20
        private const val MIN_SEARCH_QUERY_LENGTH = 3
        private const val CACHE_TIMEOUT_MINUTES = 30L
        private const val SEARCH_CACHE_SIZE = 100
        private const val BACKGROUND_REFRESH_INTERVAL = 15L
    }
}

/**
 * Simple LRU cache implementation for search results
 */
private class LruCache<K, V>(private val maxSize: Int) {
    private val map = LinkedHashMap<K, V>(maxSize, 0.75f, true)

    @Synchronized
    fun put(key: K, value: V) {
        map[key] = value
        if (map.size > maxSize) {
            map.remove(map.keys.first())
        }
    }

    @Synchronized
    fun get(key: K): V? = map[key]
}
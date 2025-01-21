package com.austa.superapp.features.marketplace.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.austa.superapp.core.constants.AppConstants.UI
import com.austa.superapp.features.marketplace.data.MarketplaceRepository
import com.austa.superapp.features.marketplace.domain.models.Product
import com.austa.superapp.common.ProductCategory
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject
import java.io.IOException

/**
 * ViewModel managing marketplace UI state and business logic with enhanced search and filtering capabilities.
 * Implements comprehensive product management with error handling and analytics tracking.
 * Version: 1.0.0
 */
@HiltViewModel
class MarketplaceViewModel @Inject constructor(
    private val marketplaceRepository: MarketplaceRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(MarketplaceUiState())
    val uiState: StateFlow<MarketplaceUiState> = _uiState.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedCategory = MutableStateFlow<ProductCategory?>(null)
    val selectedCategory: StateFlow<ProductCategory?> = _selectedCategory.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadInitialProducts()
        setupSearchDebounce()
    }

    /**
     * Loads products with optional category filter and pagination support
     */
    fun loadProducts(
        category: ProductCategory? = null,
        page: Int = 1,
        pageSize: Int = UI.PAGINATION_PAGE_SIZE
    ) {
        viewModelScope.launch {
            try {
                _uiState.update { it.copy(isLoading = true, error = null) }

                marketplaceRepository.getProducts(category, page - 1, pageSize)
                    .catch { e ->
                        handleError("Failed to load products", e)
                    }
                    .collect { result ->
                        result.fold(
                            onSuccess = { products ->
                                _uiState.update { currentState ->
                                    currentState.copy(
                                        products = if (page == 1) products else currentState.products + products,
                                        isLoading = false,
                                        currentPage = page,
                                        hasMorePages = products.size >= pageSize,
                                        error = null
                                    )
                                }
                            },
                            onFailure = { e ->
                                handleError("Failed to load products", e)
                            }
                        )
                    }
            } catch (e: Exception) {
                handleError("Failed to load products", e)
            }
        }
    }

    /**
     * Performs debounced product search with category filtering
     */
    fun searchProducts(query: String, category: ProductCategory? = null) {
        _searchQuery.value = query
        _selectedCategory.value = category

        if (query.length < MIN_SEARCH_LENGTH) {
            loadProducts(category)
            return
        }

        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            try {
                _uiState.update { it.copy(isLoading = true, error = null) }

                // Apply debouncing
                kotlinx.coroutines.delay(UI.DEBOUNCE_DELAY_MS)

                marketplaceRepository.searchProducts(query, category)
                    .catch { e ->
                        handleError("Search failed", e)
                    }
                    .collect { result ->
                        result.fold(
                            onSuccess = { products ->
                                _uiState.update { it.copy(
                                    products = products,
                                    isLoading = false,
                                    error = null,
                                    currentPage = 1,
                                    hasMorePages = false
                                )}
                            },
                            onFailure = { e ->
                                handleError("Search failed", e)
                            }
                        )
                    }
            } catch (e: Exception) {
                handleError("Search failed", e)
            }
        }
    }

    /**
     * Forces refresh of product data with error handling and retry mechanism
     */
    fun refreshProducts() {
        viewModelScope.launch {
            try {
                _uiState.update { it.copy(isRefreshing = true, error = null) }

                var retryCount = 0
                var success = false

                while (retryCount < MAX_RETRY_ATTEMPTS && !success) {
                    marketplaceRepository.refreshProducts()
                        .fold(
                            onSuccess = {
                                loadProducts(_selectedCategory.value)
                                success = true
                            },
                            onFailure = { e ->
                                retryCount++
                                if (retryCount >= MAX_RETRY_ATTEMPTS) {
                                    handleError("Refresh failed after $MAX_RETRY_ATTEMPTS attempts", e)
                                } else {
                                    kotlinx.coroutines.delay(RETRY_DELAY_MS * retryCount)
                                }
                            }
                        )
                }
            } catch (e: Exception) {
                handleError("Refresh failed", e)
            } finally {
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    private fun loadInitialProducts() {
        loadProducts(pageSize = INITIAL_PAGE_SIZE)
    }

    private fun setupSearchDebounce() {
        viewModelScope.launch {
            _searchQuery
                .debounce(UI.DEBOUNCE_DELAY_MS)
                .distinctUntilChanged()
                .collect { query ->
                    if (query.isNotBlank()) {
                        searchProducts(query, _selectedCategory.value)
                    }
                }
        }
    }

    private fun handleError(message: String, error: Throwable) {
        Timber.e(error, message)
        val errorMessage = when (error) {
            is IOException -> "Network error. Please check your connection."
            else -> "An unexpected error occurred. Please try again."
        }
        _uiState.update { it.copy(
            isLoading = false,
            isRefreshing = false,
            error = errorMessage
        )}
    }

    companion object {
        private const val MIN_SEARCH_LENGTH = 2
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val RETRY_DELAY_MS = 1000L
        private const val INITIAL_PAGE_SIZE = 20
    }
}

/**
 * Data class representing comprehensive marketplace UI state
 */
data class MarketplaceUiState(
    val products: List<Product> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedCategory: ProductCategory? = null,
    val searchQuery: String = "",
    val isRefreshing: Boolean = false,
    val currentPage: Int = 1,
    val hasMorePages: Boolean = true
)
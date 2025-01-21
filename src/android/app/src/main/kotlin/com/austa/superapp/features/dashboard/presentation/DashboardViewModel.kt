package com.austa.superapp.features.dashboard.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject
import android.util.LruCache
import com.austa.superapp.core.constants.AppConstants.UI
import com.austa.superapp.features.dashboard.data.DashboardRepository
import com.austa.superapp.features.auth.data.AuthRepository
import com.austa.superapp.features.dashboard.domain.models.HealthMetric
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

/**
 * ViewModel managing dashboard UI state and health metrics with HIPAA compliance
 * and optimized performance for the AUSTA SuperApp dashboard.
 */
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val dashboardRepository: DashboardRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    companion object {
        private const val TAG = "DashboardViewModel"
        private const val CACHE_SIZE = 50
        private const val METRICS_REFRESH_INTERVAL = UI.REFRESH_INTERVAL_MS
        private const val MAX_RETRY_ATTEMPTS = 3
    }

    // Secure state management
    private val _uiState = MutableStateFlow<DashboardUiState>(DashboardUiState.Loading)
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    // Thread-safe operation flags
    private val isRefreshing = AtomicBoolean(false)
    private var metricsCollectionJob: Job? = null

    // Secure metrics cache with size limit
    private val metricsCache = LruCache<String, List<HealthMetric>>(CACHE_SIZE)

    // Error handling for coroutines
    private val errorHandler = CoroutineExceptionHandler { _, throwable ->
        Timber.e(throwable, "Error in DashboardViewModel coroutine")
        handleError(throwable)
    }

    init {
        initializeSecureContext()
        startMetricsCollection()
    }

    /**
     * Initializes secure context and starts monitoring auth state
     */
    private fun initializeSecureContext() {
        viewModelScope.launch(errorHandler) {
            // Monitor authentication state
            authRepository.currentUser.collect { user ->
                if (user == null) {
                    _uiState.value = DashboardUiState.Unauthorized
                    stopMetricsCollection()
                } else {
                    refreshDashboard()
                }
            }
        }
    }

    /**
     * Starts secure health metrics collection with optimized polling
     */
    private fun startMetricsCollection() {
        metricsCollectionJob = viewModelScope.launch(errorHandler) {
            while (true) {
                collectHealthMetrics()
                kotlinx.coroutines.delay(METRICS_REFRESH_INTERVAL)
            }
        }
    }

    /**
     * Stops metrics collection safely
     */
    private fun stopMetricsCollection() {
        metricsCollectionJob?.cancel()
        metricsCollectionJob = null
        metricsCache.evictAll()
    }

    /**
     * Refreshes dashboard data with security validation and error handling
     */
    fun refreshDashboard() {
        if (!isRefreshing.compareAndSet(false, true)) {
            return
        }

        viewModelScope.launch(errorHandler) {
            try {
                _uiState.value = DashboardUiState.Loading

                // Verify user authentication
                val currentUser = authRepository.currentUser.value
                if (currentUser == null) {
                    _uiState.value = DashboardUiState.Unauthorized
                    return@launch
                }

                // Sync health metrics with retry mechanism
                var retryCount = 0
                var success = false

                while (retryCount < MAX_RETRY_ATTEMPTS && !success) {
                    dashboardRepository.syncHealthMetrics()
                        .onSuccess {
                            success = true
                            collectHealthMetrics()
                        }
                        .onFailure { error ->
                            Timber.w(error, "Sync attempt ${retryCount + 1} failed")
                            retryCount++
                            if (retryCount < MAX_RETRY_ATTEMPTS) {
                                kotlinx.coroutines.delay(1000L * retryCount)
                            }
                        }
                }

                if (!success) {
                    handleError(Exception("Failed to sync after $MAX_RETRY_ATTEMPTS attempts"))
                }

            } catch (e: Exception) {
                handleError(e)
            } finally {
                isRefreshing.set(false)
            }
        }
    }

    /**
     * Collects and processes health metrics with security validation
     */
    private suspend fun collectHealthMetrics() {
        try {
            dashboardRepository.getHealthMetrics()
                .map { metrics -> metrics.filter { it.validate() } }
                .collect { validMetrics ->
                    // Update cache with validated metrics
                    metricsCache.put(
                        Instant.now().toString(),
                        validMetrics
                    )

                    // Update UI state with processed metrics
                    _uiState.value = DashboardUiState.Success(
                        metrics = validMetrics,
                        lastUpdated = Instant.now()
                    )
                }
        } catch (e: Exception) {
            handleError(e)
        }
    }

    /**
     * Handles errors with appropriate UI updates and logging
     */
    private fun handleError(error: Throwable) {
        Timber.e(error, "Dashboard error")
        
        val errorMessage = when (error) {
            is SecurityException -> "Security validation failed"
            is IllegalStateException -> "Invalid dashboard state"
            else -> "Failed to update dashboard"
        }

        _uiState.value = DashboardUiState.Error(errorMessage)
    }

    override fun onCleared() {
        super.onCleared()
        stopMetricsCollection()
        metricsCache.evictAll()
    }
}

/**
 * Sealed class representing dashboard UI states with HIPAA compliance
 */
sealed class DashboardUiState {
    object Loading : DashboardUiState()
    object Unauthorized : DashboardUiState()
    data class Success(
        val metrics: List<HealthMetric>,
        val lastUpdated: Instant
    ) : DashboardUiState()
    data class Error(val message: String) : DashboardUiState()
}
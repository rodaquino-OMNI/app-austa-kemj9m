package com.austa.superapp.features.wearables.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.austa.superapp.features.wearables.domain.models.WearableData
import com.austa.superapp.features.wearables.data.WearablesRepository
import com.austa.superapp.core.network.ApiClient
import com.austa.superapp.core.constants.AppConstants.NETWORK
import com.austa.superapp.core.constants.AppConstants.HEALTH_RECORDS
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.time.Instant
import javax.inject.Inject
import android.util.Log

/**
 * ViewModel managing wearable device data presentation and user interactions.
 * Implements HIPAA-compliant data handling with comprehensive error management.
 * Version: 1.0.0
 */
@HiltViewModel
class WearablesViewModel @Inject constructor(
    private val repository: WearablesRepository,
    private val networkMonitor: NetworkMonitor,
    private val performanceTracker: PerformanceTracker
) : ViewModel() {

    companion object {
        private const val TAG = "WearablesViewModel"
        private const val SYNC_INTERVAL_MINUTES = 15L
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val SYNC_TIMEOUT_MS = 5000L
        private const val ERROR_THRESHOLD = 5
    }

    private val _uiState = MutableStateFlow<WearablesUiState>(WearablesUiState.Loading)
    val uiState: StateFlow<WearablesUiState> = _uiState.asStateFlow()

    private var syncJob: Job? = null
    private var errorCount = 0

    private val coroutineExceptionHandler = CoroutineExceptionHandler { _, throwable ->
        handleError(throwable)
    }

    init {
        setupInitialState()
        startPeriodicSync()
        monitorNetwork()
    }

    private fun setupInitialState() {
        viewModelScope.launch(coroutineExceptionHandler) {
            performanceTracker.startTracking("wearables_init")
            val cachedData = repository.getCachedData()
            _uiState.value = if (cachedData.isNotEmpty()) {
                WearablesUiState.Success(cachedData)
            } else {
                WearablesUiState.Loading
            }
            performanceTracker.stopTracking("wearables_init")
        }
    }

    private fun startPeriodicSync() {
        syncJob?.cancel()
        syncJob = viewModelScope.launch(coroutineExceptionHandler) {
            while (true) {
                if (networkMonitor.isNetworkAvailable()) {
                    performSync()
                }
                delay(SYNC_INTERVAL_MINUTES * 60 * 1000)
            }
        }
    }

    private fun monitorNetwork() {
        viewModelScope.launch {
            networkMonitor.networkStatus.collect { isAvailable ->
                if (isAvailable && _uiState.value is WearablesUiState.Error) {
                    refreshData()
                }
            }
        }
    }

    /**
     * Performs wearable data synchronization with timeout and retry mechanism
     */
    private suspend fun performSync() {
        performanceTracker.startTracking("wearables_sync")
        try {
            _uiState.value = WearablesUiState.Loading

            withTimeout(SYNC_TIMEOUT_MS) {
                val syncResult = repository.syncWearableData(
                    timeRange = createTimeRange(),
                    options = WearablesRepository.SyncOptions(
                        uploadEnabled = true,
                        validateFhir = true
                    )
                )

                syncResult.collect { result ->
                    result.fold(
                        onSuccess = { data ->
                            val validData = data.filter { it.isValid() }
                            if (validData.isNotEmpty()) {
                                _uiState.value = WearablesUiState.Success(validData)
                                errorCount = 0
                            } else {
                                _uiState.value = WearablesUiState.Error(
                                    "No valid wearable data available"
                                )
                            }
                        },
                        onFailure = { error ->
                            handleError(error)
                        }
                    )
                }
            }
        } catch (e: Exception) {
            handleError(e)
        } finally {
            performanceTracker.stopTracking("wearables_sync")
        }
    }

    /**
     * Manually refreshes wearable data with validation
     */
    fun refreshData() {
        viewModelScope.launch(coroutineExceptionHandler) {
            performanceTracker.startTracking("wearables_refresh")
            try {
                _uiState.value = WearablesUiState.Loading
                performSync()
            } finally {
                performanceTracker.stopTracking("wearables_refresh")
            }
        }
    }

    /**
     * Handles errors with appropriate user feedback and retry mechanism
     */
    private fun handleError(error: Throwable) {
        Log.e(TAG, "Error in WearablesViewModel: ${error.message}", error)
        errorCount++

        val errorMessage = when (error) {
            is SecurityException -> "Security error: Please check your permissions"
            is retrofit2.HttpException -> "Network error: ${error.code()}"
            is java.net.UnknownHostException -> "No internet connection"
            else -> "An unexpected error occurred"
        }

        val shouldRetry = errorCount < MAX_RETRY_ATTEMPTS && 
                         error !is SecurityException

        _uiState.value = WearablesUiState.Error(
            message = errorMessage,
            retryable = shouldRetry
        )

        if (errorCount >= ERROR_THRESHOLD) {
            Log.w(TAG, "Error threshold reached, disabling automatic sync")
            syncJob?.cancel()
        }

        performanceTracker.trackError("wearables_error", error)
    }

    private fun createTimeRange(): androidx.health.connect.client.time.TimeRangeFilter {
        val endTime = Instant.now()
        val startTime = endTime.minusSeconds(SYNC_INTERVAL_MINUTES * 60)
        return androidx.health.connect.client.time.TimeRangeFilter.between(
            startTime,
            endTime
        )
    }

    override fun onCleared() {
        super.onCleared()
        syncJob?.cancel()
        performanceTracker.stopAllTracking()
    }
}

/**
 * Sealed class representing UI states for wearable data
 */
sealed class WearablesUiState {
    object Loading : WearablesUiState()
    data class Success(val data: List<WearableData>) : WearablesUiState()
    data class Error(
        val message: String,
        val retryable: Boolean = true
    ) : WearablesUiState()
}
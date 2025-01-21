package com.austa.superapp.features.virtualcare.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.features.virtualcare.data.VirtualCareRepository
import com.austa.superapp.features.virtualcare.data.WebRTCService
import com.austa.superapp.features.virtualcare.domain.models.Consultation
import com.austa.superapp.features.virtualcare.domain.models.Consultation.ConsultationStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import javax.inject.Inject
import java.util.Date

/**
 * Enhanced ViewModel for managing secure video consultations with comprehensive
 * performance monitoring and HIPAA compliance.
 * @version 1.0.0
 */
@HiltViewModel
class VideoConsultationViewModel @Inject constructor(
    private val repository: VirtualCareRepository,
    private val performanceTracker: PerformanceTracker,
    private val securityValidator: SecurityValidator
) : ViewModel() {

    companion object {
        private const val TAG = "VideoConsultationViewModel"
        private const val NETWORK_QUALITY_THRESHOLD = AppConstants.VIRTUAL_CARE.RECONNECT_ATTEMPTS
        private const val MAX_RECONNECTION_ATTEMPTS = AppConstants.VIRTUAL_CARE.RECONNECT_ATTEMPTS
        private const val PERFORMANCE_LOG_INTERVAL_MS = 5000L
        private const val SECURITY_VALIDATION_INTERVAL_MS = 10000L
    }

    private val _uiState = MutableStateFlow(ConsultationUiState())
    val uiState: StateFlow<ConsultationUiState> = _uiState.asStateFlow()

    private var securityContext: SecurityContext? = null
    private var performanceMetrics = mutableMapOf<String, Long>()

    init {
        initializeViewModel()
    }

    private fun initializeViewModel() {
        viewModelScope.launch {
            try {
                performanceTracker.startTracking("viewmodel_initialization")
                
                // Initialize security context
                securityContext = securityValidator.createSecurityContext()
                
                // Setup performance monitoring
                setupPerformanceMonitoring()
                
                // Start periodic security validation
                startSecurityValidation()
                
                performanceTracker.stopTracking("viewmodel_initialization")
            } catch (e: Exception) {
                handleError("Initialization failed", e)
            }
        }
    }

    /**
     * Initiates a secure video consultation with comprehensive monitoring
     * @param consultationId String ID of the consultation to start
     */
    suspend fun startSecureConsultation(consultationId: String): Result<Unit> {
        performanceTracker.startTracking("start_consultation")
        
        return try {
            // Validate security context
            securityValidator.validateSecurityContext(securityContext)
                ?: throw SecurityException("Invalid security context")

            // Update UI state to loading
            _uiState.update { it.copy(isLoading = true) }

            // Start consultation with security parameters
            val result = repository.startConsultation(consultationId)
            
            result.fold(
                onSuccess = { consultation ->
                    // Monitor WebRTC state
                    monitorWebRTCState(consultation)
                    
                    // Update UI state with active consultation
                    _uiState.update { currentState ->
                        currentState.copy(
                            isLoading = false,
                            activeConsultation = consultation,
                            securityContext = securityContext,
                            error = null
                        )
                    }
                    
                    Result.success(Unit)
                },
                onFailure = { error ->
                    handleError("Failed to start consultation", error)
                    Result.failure(error)
                }
            )
        } catch (e: Exception) {
            handleError("Consultation initialization failed", e)
            Result.failure(e)
        } finally {
            performanceTracker.stopTracking("start_consultation")
        }
    }

    /**
     * Monitors WebRTC connection state with quality assessment
     */
    private fun monitorWebRTCState(consultation: Consultation) {
        viewModelScope.launch {
            repository.getWebRTCState().collect { state ->
                when (state) {
                    is WebRTCService.WebRTCState.CONNECTED -> {
                        updateNetworkQuality(state.metrics)
                    }
                    is WebRTCService.WebRTCState.DISCONNECTED -> {
                        handleDisconnection(state.reason)
                    }
                    is WebRTCService.WebRTCState.ERROR -> {
                        handleError("WebRTC error", Exception(state.message))
                    }
                    else -> {
                        // Handle other states
                    }
                }
            }
        }
    }

    /**
     * Updates network quality metrics with performance tracking
     */
    private fun updateNetworkQuality(metrics: WebRTCService.ConnectionMetrics) {
        _uiState.update { currentState ->
            currentState.copy(
                networkQuality = NetworkQuality(
                    bitrate = metrics.bitrate,
                    packetLoss = metrics.packetLoss,
                    latency = metrics.latency,
                    timestamp = metrics.timestamp
                ),
                performanceMetrics = PerformanceMetrics(
                    cpuUsage = performanceTracker.getCpuUsage(),
                    memoryUsage = performanceTracker.getMemoryUsage(),
                    frameRate = metrics.frameRate,
                    timestamp = System.currentTimeMillis()
                )
            )
        }
    }

    /**
     * Handles connection failures with auto-recovery
     */
    private fun handleDisconnection(reason: String) {
        viewModelScope.launch {
            val currentState = _uiState.value
            
            if (currentState.reconnectionAttempts < MAX_RECONNECTION_ATTEMPTS) {
                _uiState.update { it.copy(
                    reconnectionAttempts = it.reconnectionAttempts + 1,
                    error = "Connection lost: $reason. Attempting to reconnect..."
                ) }
                
                // Attempt reconnection
                currentState.activeConsultation?.let { consultation ->
                    startSecureConsultation(consultation.id)
                }
            } else {
                handleError("Maximum reconnection attempts reached", Exception(reason))
            }
        }
    }

    /**
     * Sets up performance monitoring with periodic logging
     */
    private fun setupPerformanceMonitoring() {
        performanceTracker.apply {
            setLogInterval(PERFORMANCE_LOG_INTERVAL_MS)
            setMetricsCallback { metrics ->
                performanceMetrics = metrics.toMutableMap()
            }
            setErrorCallback { operation, error ->
                handleError("Performance error in $operation", error)
            }
        }
    }

    /**
     * Starts periodic security validation
     */
    private fun startSecurityValidation() {
        viewModelScope.launch {
            while (true) {
                withTimeout(SECURITY_VALIDATION_INTERVAL_MS) {
                    securityValidator.validateSecurityContext(securityContext)
                }
            }
        }
    }

    /**
     * Handles errors with logging and UI updates
     */
    private fun handleError(message: String, error: Throwable) {
        performanceTracker.trackError(message, error)
        _uiState.update { it.copy(
            isLoading = false,
            error = "$message: ${error.message}"
        ) }
    }

    /**
     * Enhanced UI state with security and performance metrics
     */
    data class ConsultationUiState(
        val isLoading: Boolean = false,
        val activeConsultation: Consultation? = null,
        val isAudioEnabled: Boolean = true,
        val isVideoEnabled: Boolean = true,
        val networkQuality: NetworkQuality = NetworkQuality(),
        val performanceMetrics: PerformanceMetrics = PerformanceMetrics(),
        val securityContext: SecurityContext? = null,
        val reconnectionAttempts: Int = 0,
        val error: String? = null
    )

    data class NetworkQuality(
        val bitrate: Int = 0,
        val packetLoss: Float = 0f,
        val latency: Long = 0,
        val timestamp: Long = 0
    )

    data class PerformanceMetrics(
        val cpuUsage: Float = 0f,
        val memoryUsage: Long = 0,
        val frameRate: Float = 0f,
        val timestamp: Long = 0
    )

    override fun onCleared() {
        performanceTracker.stopAll()
        super.onCleared()
    }
}
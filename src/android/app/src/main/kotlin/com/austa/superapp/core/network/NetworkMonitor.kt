package com.austa.superapp.core.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkCallback
import android.net.Network
import android.util.Log
import com.austa.superapp.core.constants.AppConstants.NETWORK
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Comprehensive network connectivity monitor for AUSTA SuperApp with enhanced resilience
 * and sophisticated network state management.
 */
class NetworkMonitor(
    private val context: Context,
    private val config: NetworkConfig = NetworkConfig()
) {
    companion object {
        private const val TAG = "NetworkMonitor"
        private const val NETWORK_CALLBACK_DELAY_MS = 100L
        private const val CONNECTION_POOL_SIZE = 5
        private const val QUALITY_CHECK_INTERVAL_MS = 5000L
        private const val RECOVERY_ATTEMPT_MAX = 3
        private const val BANDWIDTH_THRESHOLD_MBPS = 10.0
    }

    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    
    private val _isNetworkAvailable = MutableStateFlow(false)
    private val _networkType = MutableStateFlow(NetworkType.NONE)
    private val _networkQuality = MutableStateFlow(NetworkQuality.UNUSABLE)
    
    val isNetworkAvailable: StateFlow<Boolean> = _isNetworkAvailable.asStateFlow()
    val networkType: StateFlow<NetworkType> = _networkType.asStateFlow()
    val networkQuality: StateFlow<NetworkQuality> = _networkQuality.asStateFlow()

    private val connectionPool = ConcurrentHashMap<Network, NetworkQualityReport>()
    private val recoveryAttempts = AtomicInteger(0)
    private var isMonitoring = false

    private val networkCallback = object : NetworkCallback() {
        override fun onAvailable(network: Network) {
            handleNetworkAvailable(network)
        }

        override fun onLost(network: Network) {
            handleNetworkLost(network)
        }

        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            handleCapabilitiesChanged(network, capabilities)
        }

        override fun onBlockedStatusChanged(network: Network, blocked: Boolean) {
            handleBlockedStatusChanged(network, blocked)
        }
    }

    /**
     * Begins enhanced network state monitoring with resilience mechanisms
     */
    fun startMonitoring() {
        if (isMonitoring) return
        
        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback)
            isMonitoring = true
            initializeNetworkState()
            startQualityMonitoring()
            Log.d(TAG, "Network monitoring started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start network monitoring", e)
            handleMonitoringError(e)
        }
    }

    /**
     * Gracefully stops network monitoring and cleans up resources
     */
    fun stopMonitoring() {
        if (!isMonitoring) return
        
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
            connectionPool.clear()
            isMonitoring = false
            coroutineScope.launch {
                _isNetworkAvailable.emit(false)
                _networkType.emit(NetworkType.NONE)
                _networkQuality.emit(NetworkQuality.UNUSABLE)
            }
            Log.d(TAG, "Network monitoring stopped successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping network monitoring", e)
        }
    }

    private fun initializeNetworkState() {
        connectivityManager.activeNetwork?.let { network ->
            connectivityManager.getNetworkCapabilities(network)?.let { capabilities ->
                handleCapabilitiesChanged(network, capabilities)
            }
        }
    }

    private fun handleNetworkAvailable(network: Network) {
        coroutineScope.launch {
            _isNetworkAvailable.emit(true)
            recoveryAttempts.set(0)
            connectivityManager.getNetworkCapabilities(network)?.let { capabilities ->
                val qualityReport = checkNetworkCapabilities(capabilities)
                connectionPool[network] = qualityReport
                updateNetworkState(qualityReport)
            }
        }
    }

    private fun handleNetworkLost(network: Network) {
        coroutineScope.launch {
            connectionPool.remove(network)
            if (connectionPool.isEmpty()) {
                _isNetworkAvailable.emit(false)
                _networkType.emit(NetworkType.NONE)
                _networkQuality.emit(NetworkQuality.UNUSABLE)
                attemptNetworkRecovery()
            }
        }
    }

    private fun handleCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
        coroutineScope.launch {
            val qualityReport = checkNetworkCapabilities(capabilities)
            connectionPool[network] = qualityReport
            updateNetworkState(qualityReport)
        }
    }

    private fun handleBlockedStatusChanged(network: Network, blocked: Boolean) {
        if (blocked) {
            Log.w(TAG, "Network ${network.networkHandle} is blocked")
            connectionPool.remove(network)
        }
    }

    private fun checkNetworkCapabilities(capabilities: NetworkCapabilities): NetworkQualityReport {
        val hasWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        val hasCellular = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
        val hasVpn = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        
        val bandwidth = capabilities.getLinkDownstreamBandwidthKbps() / 1000.0 // Convert to Mbps
        val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        val validated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)

        return NetworkQualityReport(
            type = determineNetworkType(hasWifi, hasCellular, hasVpn, bandwidth),
            quality = determineNetworkQuality(bandwidth, validated, hasInternet),
            bandwidth = bandwidth,
            validated = validated,
            hasInternet = hasInternet
        )
    }

    private fun determineNetworkType(
        hasWifi: Boolean,
        hasCellular: Boolean,
        hasVpn: Boolean,
        bandwidth: Double
    ): NetworkType = when {
        hasVpn -> NetworkType.VPN
        hasWifi -> if (bandwidth >= BANDWIDTH_THRESHOLD_MBPS) NetworkType.WIFI_HIGH else NetworkType.WIFI_LOW
        hasCellular -> when {
            bandwidth >= 100.0 -> NetworkType.CELLULAR_5G
            bandwidth >= 20.0 -> NetworkType.CELLULAR_4G
            else -> NetworkType.CELLULAR_3G
        }
        else -> NetworkType.NONE
    }

    private fun determineNetworkQuality(
        bandwidth: Double,
        validated: Boolean,
        hasInternet: Boolean
    ): NetworkQuality = when {
        !hasInternet -> NetworkQuality.UNUSABLE
        !validated -> NetworkQuality.POOR
        bandwidth >= 50.0 -> NetworkQuality.EXCELLENT
        bandwidth >= 20.0 -> NetworkQuality.GOOD
        bandwidth >= 5.0 -> NetworkQuality.FAIR
        else -> NetworkQuality.POOR
    }

    private fun updateNetworkState(report: NetworkQualityReport) {
        coroutineScope.launch {
            _networkType.emit(report.type)
            _networkQuality.emit(report.quality)
        }
    }

    private fun startQualityMonitoring() {
        coroutineScope.launch {
            while (isMonitoring) {
                connectionPool.forEach { (network, _) ->
                    connectivityManager.getNetworkCapabilities(network)?.let { capabilities ->
                        val qualityReport = checkNetworkCapabilities(capabilities)
                        connectionPool[network] = qualityReport
                        updateNetworkState(qualityReport)
                    }
                }
                kotlinx.coroutines.delay(QUALITY_CHECK_INTERVAL_MS)
            }
        }
    }

    private fun attemptNetworkRecovery() {
        if (recoveryAttempts.incrementAndGet() <= RECOVERY_ATTEMPT_MAX) {
            coroutineScope.launch {
                kotlinx.coroutines.delay(NETWORK.RETRY_DELAY_MS)
                initializeNetworkState()
            }
        }
    }

    private fun handleMonitoringError(error: Exception) {
        Log.e(TAG, "Network monitoring error: ${error.message}")
        if (recoveryAttempts.incrementAndGet() <= RECOVERY_ATTEMPT_MAX) {
            coroutineScope.launch {
                kotlinx.coroutines.delay(NETWORK.RETRY_DELAY_MS)
                startMonitoring()
            }
        }
    }

    data class NetworkQualityReport(
        val type: NetworkType,
        val quality: NetworkQuality,
        val bandwidth: Double,
        val validated: Boolean,
        val hasInternet: Boolean
    )

    data class NetworkConfig(
        val enableQualityMonitoring: Boolean = true,
        val qualityCheckInterval: Long = QUALITY_CHECK_INTERVAL_MS,
        val maxRecoveryAttempts: Int = RECOVERY_ATTEMPT_MAX,
        val connectionPoolSize: Int = CONNECTION_POOL_SIZE
    )
}

enum class NetworkType {
    WIFI_HIGH,
    WIFI_LOW,
    CELLULAR_5G,
    CELLULAR_4G,
    CELLULAR_3G,
    VPN,
    NONE
}

enum class NetworkQuality {
    EXCELLENT,
    GOOD,
    FAIR,
    POOR,
    UNUSABLE
}
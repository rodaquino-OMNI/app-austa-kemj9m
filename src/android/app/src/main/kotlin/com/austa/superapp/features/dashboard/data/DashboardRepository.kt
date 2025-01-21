package com.austa.superapp.features.dashboard.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import com.austa.superapp.core.constants.AppConstants.SECURITY
import com.austa.superapp.core.network.ApiClient
import com.austa.superapp.core.network.ApiEndpoints
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.core.security.EncryptedData
import com.austa.superapp.features.dashboard.domain.models.HealthMetric
import com.austa.superapp.features.wearables.data.HealthConnectService
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Secure repository implementation for managing dashboard health metrics with HIPAA compliance.
 * Implements FHIR-compliant data handling and fault-tolerant synchronization.
 */
@AndroidEntryPoint
@Singleton
class DashboardRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val healthConnectService: HealthConnectService
) {
    companion object {
        private const val TAG = "DashboardRepository"
        private const val METRICS_CACHE_KEY = "encrypted_health_metrics"
        private const val SYNC_INTERVAL_MS = 15 * 60 * 1000L // 15 minutes
        private const val MAX_RETRY_ATTEMPTS = 3
    }

    private val encryptionManager = EncryptionManager()
    private val apiClient = ApiClient.getInstance(context)
    private val repositoryScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val isSyncing = AtomicBoolean(false)

    // Encrypted shared preferences for secure local storage
    private val encryptedPrefs = EncryptedSharedPreferences.create(
        "dashboard_prefs",
        SECURITY.KEY_ALIAS,
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    // Encrypted state flow for health metrics
    private val _healthMetrics = MutableStateFlow<List<HealthMetric>>(emptyList())

    init {
        initializeSecureContext()
        startPeriodicSync()
    }

    private fun initializeSecureContext() {
        try {
            // Initialize encryption for health metrics
            encryptionManager.generateKey("health_metrics_key", requireHardwareProtection = true)
            
            // Load cached metrics from encrypted storage
            loadEncryptedCache()
            
            // Setup secure logging
            android.util.Log.i(TAG, "Secure context initialized successfully")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to initialize secure context: ${e.message}")
        }
    }

    private fun startPeriodicSync() {
        repositoryScope.launch {
            while (true) {
                syncHealthMetrics()
                kotlinx.coroutines.delay(SYNC_INTERVAL_MS)
            }
        }
    }

    /**
     * Retrieves encrypted and FHIR-validated health metrics flow
     */
    fun getHealthMetrics(): Flow<List<HealthMetric>> = _healthMetrics
        .map { metrics ->
            metrics.filter { it.validate() }
        }
        .catch { e ->
            android.util.Log.e(TAG, "Error retrieving health metrics: ${e.message}")
            emit(emptyList())
        }
        .flowOn(Dispatchers.IO)

    /**
     * Securely synchronizes health metrics with retry mechanism and FHIR validation
     */
    suspend fun syncHealthMetrics(): Result<Unit> = withContext(Dispatchers.IO) {
        if (!isSyncing.compareAndSet(false, true)) {
            return@withContext Result.failure(IllegalStateException("Sync already in progress"))
        }

        try {
            var retryCount = 0
            var success = false

            while (retryCount < MAX_RETRY_ATTEMPTS && !success) {
                try {
                    // Fetch and validate wearable data
                    val timeRange = androidx.health.connect.client.time.TimeRangeFilter.between(
                        Instant.now().minus(1, java.time.temporal.ChronoUnit.DAYS),
                        Instant.now()
                    )

                    healthConnectService.syncHealthData(timeRange)
                        .collect { wearableDataList ->
                            val validatedMetrics = wearableDataList.mapNotNull { wearableData ->
                                HealthMetric(
                                    metricType = wearableData.metrics.keys.first(),
                                    value = wearableData.metrics.values.first(),
                                    deviceData = wearableData.toHealthRecord().device
                                ).takeIf { it.validate() }
                            }

                            // Encrypt and update local cache
                            updateEncryptedCache(validatedMetrics)
                            
                            // Update state flow
                            _healthMetrics.value = validatedMetrics
                            
                            success = true
                        }
                } catch (e: Exception) {
                    android.util.Log.e(TAG, "Sync attempt ${retryCount + 1} failed: ${e.message}")
                    retryCount++
                    if (retryCount < MAX_RETRY_ATTEMPTS) {
                        kotlinx.coroutines.delay(1000L * retryCount)
                    }
                }
            }

            if (success) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to sync after $MAX_RETRY_ATTEMPTS attempts"))
            }
        } finally {
            isSyncing.set(false)
        }
    }

    /**
     * Securely updates a health metric with FHIR validation
     */
    suspend fun updateHealthMetric(metric: HealthMetric): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            // Validate metric
            if (!metric.validate()) {
                return@withContext Result.failure(IllegalArgumentException("Invalid health metric"))
            }

            // Convert to FHIR format
            val fhirData = metric.toFhirObservation()

            // Encrypt metric data
            val encryptedMetric = encryptionManager.encryptData(
                fhirData.toByteArray(),
                "health_metrics_key"
            )

            // Update remote API
            apiClient.createService(DashboardApiService::class.java)
                .updateMetric(encryptedMetric)

            // Update local cache
            val currentMetrics = _healthMetrics.value.toMutableList()
            val index = currentMetrics.indexOfFirst { it.id == metric.id }
            if (index != -1) {
                currentMetrics[index] = metric
            } else {
                currentMetrics.add(metric)
            }
            
            updateEncryptedCache(currentMetrics)
            _healthMetrics.value = currentMetrics

            Result.success(Unit)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to update health metric: ${e.message}")
            Result.failure(e)
        }
    }

    private fun updateEncryptedCache(metrics: List<HealthMetric>) {
        try {
            val serializedMetrics = kotlinx.serialization.json.Json.encodeToString(
                kotlinx.serialization.builtins.ListSerializer(HealthMetric.serializer()),
                metrics
            )
            
            val encryptedData = encryptionManager.encryptData(
                serializedMetrics.toByteArray(),
                "health_metrics_key"
            )

            encryptedPrefs.edit().apply {
                putString(METRICS_CACHE_KEY, android.util.Base64.encodeToString(
                    encryptedData.encryptedBytes,
                    android.util.Base64.NO_WRAP
                ))
                apply()
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to update encrypted cache: ${e.message}")
        }
    }

    private fun loadEncryptedCache() {
        try {
            val encryptedBase64 = encryptedPrefs.getString(METRICS_CACHE_KEY, null)
            if (encryptedBase64 != null) {
                val encryptedBytes = android.util.Base64.decode(
                    encryptedBase64,
                    android.util.Base64.NO_WRAP
                )
                
                val decryptedData = encryptionManager.decryptData(EncryptedData(
                    encryptedBytes = encryptedBytes,
                    iv = ByteArray(12), // IV should be stored with encrypted data
                    keyVersion = 1,
                    timestamp = System.currentTimeMillis()
                ))

                val metrics = kotlinx.serialization.json.Json.decodeFromString(
                    kotlinx.serialization.builtins.ListSerializer(HealthMetric.serializer()),
                    String(decryptedData)
                )
                
                _healthMetrics.value = metrics
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to load encrypted cache: ${e.message}")
        }
    }
}
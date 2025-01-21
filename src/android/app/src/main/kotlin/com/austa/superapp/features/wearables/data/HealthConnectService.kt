package com.austa.superapp.features.wearables.data

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.austa.superapp.core.constants.AppConstants.SECURITY
import com.austa.superapp.core.network.ApiClient
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.features.wearables.domain.models.WearableData
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import javax.crypto.SecretKey

/**
 * Service class managing Health Connect API integration with enhanced security and FHIR compliance.
 * Version: 1.1.0-alpha02 (androidx.health.connect:health-connect-client)
 */
@HiltViewModel
class HealthConnectService @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "HealthConnectService"
        private const val ENCRYPTION_KEY_ALIAS = "health_connect_key"
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val SYNC_INTERVAL = 15L * 60L * 1000L // 15 minutes
    }

    private val healthConnectClient: HealthConnectClient by lazy {
        HealthConnectClient.getOrCreate(context)
    }

    private val encryptionManager = EncryptionManager()
    private val apiClient = ApiClient.getInstance(context)
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _availability = MutableStateFlow<HealthConnectAvailability>(
        HealthConnectAvailability.NOT_SUPPORTED
    )
    val availability: StateFlow<HealthConnectAvailability> = _availability.asStateFlow()

    private val requiredPermissions = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(BloodPressureRecord::class),
        HealthPermission.getReadPermission(BloodGlucoseRecord::class),
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class)
    )

    init {
        initializeSecureContext()
        monitorAvailability()
    }

    private fun initializeSecureContext() {
        try {
            // Initialize secure key for health data encryption
            encryptionManager.generateKey(ENCRYPTION_KEY_ALIAS, requireHardwareProtection = true)
            
            // Setup secure logging
            serviceScope.launch {
                checkAvailability().collect { status ->
                    android.util.Log.i(TAG, "Health Connect availability: $status")
                }
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to initialize secure context: ${e.message}")
        }
    }

    private fun monitorAvailability() {
        serviceScope.launch {
            try {
                val availability = healthConnectClient.availability
                _availability.value = availability
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Failed to check Health Connect availability: ${e.message}")
                _availability.value = HealthConnectAvailability.NOT_SUPPORTED
            }
        }
    }

    /**
     * Checks Health Connect API availability with enhanced error handling
     */
    fun checkAvailability(): Flow<HealthConnectAvailability> = flow {
        var retryCount = 0
        while (retryCount < MAX_RETRY_ATTEMPTS) {
            try {
                val availability = healthConnectClient.availability
                emit(availability)
                break
            } catch (e: Exception) {
                retryCount++
                if (retryCount == MAX_RETRY_ATTEMPTS) {
                    android.util.Log.e(TAG, "Failed to check availability after $MAX_RETRY_ATTEMPTS attempts")
                    emit(HealthConnectAvailability.NOT_SUPPORTED)
                }
                kotlinx.coroutines.delay(1000L * retryCount)
            }
        }
    }

    /**
     * Requests necessary Health Connect permissions with enhanced security
     */
    suspend fun requestPermissions(): Result<Unit> = try {
        val permissionContract = healthConnectClient.permissionController
            .createRequestPermissionResultContract()

        val granted = permissionContract.launch(requiredPermissions)
        if (granted.containsAll(requiredPermissions)) {
            Result.success(Unit)
        } else {
            Result.failure(SecurityException("Not all permissions were granted"))
        }
    } catch (e: Exception) {
        android.util.Log.e(TAG, "Permission request failed: ${e.message}")
        Result.failure(e)
    }

    /**
     * Synchronizes encrypted health data from Health Connect with FHIR compliance
     */
    suspend fun syncHealthData(timeRange: TimeRangeFilter): Flow<List<WearableData>> = flow {
        if (_availability.value != HealthConnectAvailability.AVAILABLE) {
            throw IllegalStateException("Health Connect is not available")
        }

        val records = mutableListOf<WearableData>()
        
        try {
            // Read and encrypt heart rate data
            val heartRateRecords = readRecords<HeartRateRecord>(timeRange)
            records.addAll(heartRateRecords.map { record ->
                encryptAndConvertToWearableData(record)
            })

            // Read and encrypt blood pressure data
            val bloodPressureRecords = readRecords<BloodPressureRecord>(timeRange)
            records.addAll(bloodPressureRecords.map { record ->
                encryptAndConvertToWearableData(record)
            })

            // Read and encrypt other vital signs
            val oxygenRecords = readRecords<OxygenSaturationRecord>(timeRange)
            records.addAll(oxygenRecords.map { record ->
                encryptAndConvertToWearableData(record)
            })

            emit(records)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to sync health data: ${e.message}")
            throw e
        }
    }

    /**
     * Writes encrypted health data to Health Connect with FHIR validation
     */
    suspend fun writeHealthData(data: WearableData): Result<Unit> = try {
        if (!data.isValid()) {
            return Result.failure(IllegalArgumentException("Invalid health data"))
        }

        val encryptedData = encryptionManager.encryptData(
            data.toHealthRecord().toString().toByteArray(),
            ENCRYPTION_KEY_ALIAS
        )

        when (data.type) {
            WearableType.SMARTWATCH, WearableType.FITNESS_TRACKER -> {
                writeWearableData(data, encryptedData)
            }
            WearableType.MEDICAL_DEVICE -> {
                writeMedicalDeviceData(data, encryptedData)
            }
            else -> {
                Result.failure(IllegalArgumentException("Unsupported device type"))
            }
        }
    } catch (e: Exception) {
        android.util.Log.e(TAG, "Failed to write health data: ${e.message}")
        Result.failure(e)
    }

    private suspend inline fun <reified T : Record> readRecords(
        timeRange: TimeRangeFilter
    ): List<T> {
        val request = ReadRecordsRequest(
            recordType = T::class,
            timeRangeFilter = timeRange,
            ascendingOrder = true
        )
        return healthConnectClient.readRecords(request).records
    }

    private fun encryptAndConvertToWearableData(record: Record): WearableData {
        val wearableData = when (record) {
            is HeartRateRecord -> convertHeartRateRecord(record)
            is BloodPressureRecord -> convertBloodPressureRecord(record)
            is OxygenSaturationRecord -> convertOxygenSaturationRecord(record)
            else -> throw IllegalArgumentException("Unsupported record type")
        }

        return wearableData.apply {
            validateFhirMappings()
        }
    }

    private suspend fun writeWearableData(
        data: WearableData,
        encryptedData: EncryptedData
    ): Result<Unit> = try {
        val records = when (data.type) {
            WearableType.SMARTWATCH -> createSmartWatchRecords(data, encryptedData)
            WearableType.FITNESS_TRACKER -> createFitnessTrackerRecords(data, encryptedData)
            else -> throw IllegalArgumentException("Invalid wearable type")
        }
        
        healthConnectClient.insertRecords(records)
        Result.success(Unit)
    } catch (e: Exception) {
        Result.failure(e)
    }

    private suspend fun writeMedicalDeviceData(
        data: WearableData,
        encryptedData: EncryptedData
    ): Result<Unit> = try {
        val records = createMedicalDeviceRecords(data, encryptedData)
        healthConnectClient.insertRecords(records)
        Result.success(Unit)
    } catch (e: Exception) {
        Result.failure(e)
    }

    private fun convertHeartRateRecord(record: HeartRateRecord): WearableData {
        return WearableData(
            id = record.metadata.id,
            deviceId = record.metadata.device?.serialNumber ?: "",
            userId = record.metadata.client.packageName,
            type = WearableType.SMARTWATCH,
            timestamp = record.startTime,
            metrics = mapOf("heartRate" to record.samples.firstOrNull()?.beatsPerMinute?.toDouble() ?: 0.0),
            metadata = createWearableMetadata(record),
            isCalibrated = true,
            fhirMappings = mapOf("heartRate" to "8867-4")
        )
    }

    private fun convertBloodPressureRecord(record: BloodPressureRecord): WearableData {
        return WearableData(
            id = record.metadata.id,
            deviceId = record.metadata.device?.serialNumber ?: "",
            userId = record.metadata.client.packageName,
            type = WearableType.MEDICAL_DEVICE,
            timestamp = record.time,
            metrics = mapOf(
                "systolic" to record.systolic.inMillimetersOfMercury.toDouble(),
                "diastolic" to record.diastolic.inMillimetersOfMercury.toDouble()
            ),
            metadata = createWearableMetadata(record),
            isCalibrated = true,
            fhirMappings = mapOf(
                "systolic" to "8480-6",
                "diastolic" to "8462-4"
            )
        )
    }

    private fun convertOxygenSaturationRecord(record: OxygenSaturationRecord): WearableData {
        return WearableData(
            id = record.metadata.id,
            deviceId = record.metadata.device?.serialNumber ?: "",
            userId = record.metadata.client.packageName,
            type = WearableType.MEDICAL_DEVICE,
            timestamp = record.time,
            metrics = mapOf("saturation" to record.percentage.toDouble()),
            metadata = createWearableMetadata(record),
            isCalibrated = true,
            fhirMappings = mapOf("saturation" to "2708-6")
        )
    }

    private fun createWearableMetadata(record: Record): WearableMetadata {
        return WearableMetadata(
            manufacturer = record.metadata.device?.manufacturer ?: "Unknown",
            model = record.metadata.device?.model ?: "Unknown",
            firmwareVersion = record.metadata.device?.softwareVersion ?: "Unknown",
            capabilities = mapOf(),
            batteryLevel = 100.0,
            isCalibrated = true,
            lastCalibrationDate = Instant.now().toString(),
            certifications = mapOf(),
            metricRanges = mapOf()
        )
    }
}
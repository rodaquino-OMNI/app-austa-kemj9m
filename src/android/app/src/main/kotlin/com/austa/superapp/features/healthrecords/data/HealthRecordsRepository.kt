package com.austa.superapp.features.healthrecords.data

import android.util.Log
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.room.withTransaction
import androidx.security.crypto.EncryptedSharedPreferences
import com.austa.superapp.core.constants.AppConstants.HEALTH_RECORDS
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.features.healthrecords.domain.models.HealthRecord
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "HealthRecordsRepository"

/**
 * Repository implementation for secure health records management with FHIR compliance
 * and comprehensive offline support.
 * Version: 1.0.0
 */
@Singleton
class HealthRecordsRepository @Inject constructor(
    private val healthRecordsService: HealthRecordsService,
    private val healthRecordsDao: HealthRecordsDao,
    private val encryptionManager: EncryptionManager,
    private val syncManager: SyncManager,
    private val scope: CoroutineScope
) {
    private val isSyncing = AtomicBoolean(false)
    private val auditLogger = AuditLogger()

    init {
        setupPeriodicSync()
    }

    /**
     * Retrieves paginated health records with encryption and offline support
     */
    fun getHealthRecords(
        patientId: String,
        filters: Map<String, String> = emptyMap(),
        paginationConfig: PaginationConfig = PaginationConfig()
    ): Flow<PagingData<HealthRecord>> {
        return Pager(
            config = PagingConfig(
                pageSize = HEALTH_RECORDS.MAX_RECORDS_PER_REQUEST,
                enablePlaceholders = true,
                maxSize = HEALTH_RECORDS.MAX_SEARCH_RESULTS
            ),
            pagingSourceFactory = {
                HealthRecordsPagingSource(
                    healthRecordsService = healthRecordsService,
                    healthRecordsDao = healthRecordsDao,
                    encryptionManager = encryptionManager,
                    patientId = patientId,
                    filters = filters,
                    paginationConfig = paginationConfig
                )
            }
        ).flow
    }

    /**
     * Uploads health record with FHIR validation and encryption
     */
    fun uploadHealthRecord(record: HealthRecord): Flow<UploadStatus> = flow {
        try {
            emit(UploadStatus.Uploading)

            // Validate FHIR compliance
            validateFhirCompliance(record)

            // Encrypt sensitive data
            val encryptedRecord = encryptRecord(record)

            // Save to local cache
            healthRecordsDao.withTransaction {
                healthRecordsDao.insertRecord(encryptedRecord)
            }

            // Upload to remote if online
            if (syncManager.isNetworkAvailable()) {
                val response = healthRecordsService.uploadRecord(encryptedRecord)
                response.collect { uploadedRecord ->
                    // Update local cache with server response
                    healthRecordsDao.withTransaction {
                        healthRecordsDao.updateRecord(uploadedRecord)
                    }
                    emit(UploadStatus.Success(uploadedRecord))
                }
            } else {
                // Mark for sync when online
                syncManager.markForSync(encryptedRecord.id)
                emit(UploadStatus.Pending(encryptedRecord))
            }

            // Log audit
            auditLogger.logRecordUpload(record.id, record.patientId)

        } catch (e: Exception) {
            Log.e(TAG, "Error uploading health record", e)
            emit(UploadStatus.Error(e))
            throw e
        }
    }.flowOn(Dispatchers.IO)

    /**
     * Synchronizes health records with conflict resolution
     */
    fun syncHealthRecords(
        patientId: String,
        syncConfig: SyncConfig = SyncConfig()
    ): Flow<SyncStatus> = flow {
        if (isSyncing.getAndSet(true)) {
            emit(SyncStatus.AlreadySyncing)
            return@flow
        }

        try {
            emit(SyncStatus.Syncing)

            // Get pending changes
            val pendingRecords = healthRecordsDao.getPendingRecords(patientId)

            // Upload pending changes
            pendingRecords.forEach { record ->
                try {
                    healthRecordsService.uploadRecord(record).collect { uploadedRecord ->
                        healthRecordsDao.withTransaction {
                            healthRecordsDao.updateRecord(uploadedRecord)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error syncing record ${record.id}", e)
                }
            }

            // Fetch remote updates
            val lastSyncTime = syncManager.getLastSyncTime(patientId)
            healthRecordsService.getPatientRecords(
                patientId = patientId,
                filters = mapOf("updated_after" to lastSyncTime.toString())
            ).collect { pagedResponse ->
                healthRecordsDao.withTransaction {
                    pagedResponse.data.forEach { record ->
                        val encryptedRecord = encryptRecord(record)
                        healthRecordsDao.insertRecord(encryptedRecord)
                    }
                }
            }

            syncManager.updateLastSyncTime(patientId)
            emit(SyncStatus.Success)

        } catch (e: Exception) {
            Log.e(TAG, "Error during sync", e)
            emit(SyncStatus.Error(e))
        } finally {
            isSyncing.set(false)
        }
    }.flowOn(Dispatchers.IO)

    /**
     * Encrypts health record data using EncryptionManager
     */
    private fun encryptRecord(record: HealthRecord): HealthRecord {
        val encryptedContent = encryptionManager.encryptData(
            record.content.toString().toByteArray(),
            "health_record_${record.id}"
        )

        return record.copy(
            content = mapOf("encrypted" to encryptedContent),
            metadata = record.metadata.copy(
                encryptionStatus = true
            )
        )
    }

    /**
     * Validates FHIR compliance of health record
     */
    private fun validateFhirCompliance(record: HealthRecord) {
        require(record.id.isNotBlank()) { "Record ID is required" }
        require(record.patientId.isNotBlank()) { "Patient ID is required" }
        require(record.providerId.isNotBlank()) { "Provider ID is required" }
        require(record.type in HealthRecordType.values()) { "Invalid record type" }
        require(record.status in HealthRecordStatus.values()) { "Invalid record status" }
        require(record.date.isNotBlank()) { "Record date is required" }
        require(record.content.isNotEmpty()) { "Record content is required" }
    }

    /**
     * Sets up periodic background sync
     */
    private fun setupPeriodicSync() {
        scope.launch(Dispatchers.IO) {
            syncManager.schedulePeriodicSync(
                interval = HEALTH_RECORDS.SYNC_INTERVAL_HOURS,
                timeUnit = java.util.concurrent.TimeUnit.HOURS
            )
        }
    }
}

/**
 * Status classes for upload operations
 */
sealed class UploadStatus {
    object Uploading : UploadStatus()
    data class Success(val record: HealthRecord) : UploadStatus()
    data class Pending(val record: HealthRecord) : UploadStatus()
    data class Error(val error: Throwable) : UploadStatus()
}

/**
 * Status classes for sync operations
 */
sealed class SyncStatus {
    object Syncing : SyncStatus()
    object Success : SyncStatus()
    object AlreadySyncing : SyncStatus()
    data class Error(val error: Throwable) : SyncStatus()
}

/**
 * Configuration class for pagination
 */
data class PaginationConfig(
    val pageSize: Int = HEALTH_RECORDS.MAX_RECORDS_PER_REQUEST,
    val initialLoadSize: Int = pageSize * 2
)

/**
 * Configuration class for sync operations
 */
data class SyncConfig(
    val forceFull: Boolean = false,
    val conflictResolution: ConflictResolution = ConflictResolution.SERVER_WINS
)

enum class ConflictResolution {
    SERVER_WINS,
    CLIENT_WINS,
    MANUAL
}
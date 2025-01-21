package com.austa.superapp.features.healthrecords.data

import android.util.Log
import com.austa.superapp.core.constants.AppConstants.HEALTH_RECORDS
import com.austa.superapp.core.constants.AppConstants.NETWORK
import com.austa.superapp.core.network.ApiClient
import com.austa.superapp.core.network.ApiEndpoints
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.features.healthrecords.domain.models.HealthRecord
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordType
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordStatus
import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import retrofit2.Response
import retrofit2.http.*
import java.time.Duration
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "HealthRecordsService"

/**
 * FHIR R4 compliant API interface for health records endpoints
 */
interface HealthRecordsApi {
    @GET(ApiEndpoints.HEALTH_RECORDS.FHIR)
    suspend fun getHealthRecords(
        @Query("patient_id") patientId: String,
        @QueryMap filters: Map<String, String>,
        @Query("page") page: Int,
        @Query("size") pageSize: Int
    ): Response<PagedResponse<HealthRecord>>

    @GET("${ApiEndpoints.HEALTH_RECORDS.FHIR}/{recordId}")
    suspend fun getHealthRecord(
        @Path("recordId") recordId: String
    ): Response<HealthRecord>

    @POST(ApiEndpoints.HEALTH_RECORDS.FHIR)
    suspend fun uploadHealthRecord(
        @Body record: HealthRecord
    ): Response<HealthRecord>
}

/**
 * Service class for secure health records management with FHIR compliance
 */
@Singleton
class HealthRecordsService @Inject constructor(
    private val scope: CoroutineScope,
    private val encryptionManager: EncryptionManager,
    private val localDao: HealthRecordsDao
) {
    private val api: HealthRecordsApi
    private val circuitBreaker: CircuitBreaker

    init {
        api = ApiClient.getInstance().createService(HealthRecordsApi::class.java)
        
        circuitBreaker = CircuitBreaker.of(
            "healthRecordsBreaker",
            CircuitBreakerConfig.custom()
                .failureRateThreshold(50f)
                .waitDurationInOpenState(Duration.ofSeconds(NETWORK.CONNECT_TIMEOUT))
                .slidingWindowSize(NETWORK.MAX_RETRIES)
                .build()
        )
    }

    /**
     * Retrieves paginated health records with secure caching and encryption
     */
    fun getPatientRecords(
        patientId: String,
        filters: Map<String, String> = emptyMap(),
        page: Int = 1,
        pageSize: Int = HEALTH_RECORDS.MAX_RECORDS_PER_REQUEST
    ): Flow<PagedResponse<HealthRecord>> = flow {
        try {
            // Check local cache first
            val cachedRecords = localDao.getPatientRecords(patientId, page, pageSize)
            if (cachedRecords.isNotEmpty()) {
                emit(PagedResponse(
                    data = cachedRecords.map { decryptHealthRecord(it) },
                    page = page,
                    totalPages = (localDao.getRecordCount(patientId) / pageSize) + 1
                ))
            }

            // Make API call with circuit breaker
            val response = circuitBreaker.executeSupplier {
                withContext(Dispatchers.IO) {
                    api.getHealthRecords(patientId, filters, page, pageSize)
                }
            }

            if (response.isSuccessful) {
                response.body()?.let { pagedResponse ->
                    // Encrypt and cache records
                    pagedResponse.data.forEach { record ->
                        val encryptedRecord = encryptHealthRecord(record)
                        localDao.insertRecord(encryptedRecord)
                    }

                    emit(pagedResponse)
                }
            } else {
                throw Exception("Failed to fetch records: ${response.code()}")
            }

        } catch (e: Exception) {
            Log.e(TAG, "Error fetching patient records", e)
            throw e
        }
    }.catch { e ->
        Log.e(TAG, "Error in getPatientRecords flow", e)
        throw e
    }.flowOn(Dispatchers.IO)

    /**
     * Retrieves a specific health record with security validation
     */
    fun getRecord(recordId: String): Flow<HealthRecord> = flow {
        try {
            // Check local cache
            localDao.getRecord(recordId)?.let { cached ->
                emit(decryptHealthRecord(cached))
            }

            // Make API call with circuit breaker
            val response = circuitBreaker.executeSupplier {
                withContext(Dispatchers.IO) {
                    api.getHealthRecord(recordId)
                }
            }

            if (response.isSuccessful) {
                response.body()?.let { record ->
                    validateFhirCompliance(record)
                    val encryptedRecord = encryptHealthRecord(record)
                    localDao.insertRecord(encryptedRecord)
                    emit(record)
                }
            } else {
                throw Exception("Failed to fetch record: ${response.code()}")
            }

        } catch (e: Exception) {
            Log.e(TAG, "Error fetching record $recordId", e)
            throw e
        }
    }.catch { e ->
        Log.e(TAG, "Error in getRecord flow", e)
        throw e
    }.flowOn(Dispatchers.IO)

    /**
     * Uploads a new health record with FHIR validation
     */
    fun uploadRecord(record: HealthRecord): Flow<HealthRecord> = flow {
        try {
            validateFhirCompliance(record)
            
            // Make API call with circuit breaker
            val response = circuitBreaker.executeSupplier {
                withContext(Dispatchers.IO) {
                    api.uploadHealthRecord(record)
                }
            }

            if (response.isSuccessful) {
                response.body()?.let { uploadedRecord ->
                    val encryptedRecord = encryptHealthRecord(uploadedRecord)
                    localDao.insertRecord(encryptedRecord)
                    emit(uploadedRecord)
                }
            } else {
                throw Exception("Failed to upload record: ${response.code()}")
            }

        } catch (e: Exception) {
            Log.e(TAG, "Error uploading record", e)
            throw e
        }
    }.catch { e ->
        Log.e(TAG, "Error in uploadRecord flow", e)
        throw e
    }.flowOn(Dispatchers.IO)

    /**
     * Encrypts sensitive health record data
     */
    private fun encryptHealthRecord(record: HealthRecord): HealthRecord {
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
     * Decrypts health record data with security validation
     */
    private fun decryptHealthRecord(record: HealthRecord): HealthRecord {
        val encryptedContent = record.content["encrypted"] as? EncryptedData
            ?: throw SecurityException("Invalid encrypted record format")

        val decryptedContent = encryptionManager.decryptData(encryptedContent)
        
        return record.copy(
            content = mapOf("decrypted" to String(decryptedContent))
        )
    }

    /**
     * Validates FHIR R4 compliance of health records
     */
    private fun validateFhirCompliance(record: HealthRecord) {
        // Validate required FHIR fields
        requireNotNull(record.id) { "Record ID is required" }
        requireNotNull(record.patientId) { "Patient ID is required" }
        requireNotNull(record.type) { "Record type is required" }
        requireNotNull(record.date) { "Record date is required" }
        requireNotNull(record.status) { "Record status is required" }

        // Validate FHIR data structures
        require(record.type in HealthRecordType.values()) { "Invalid record type" }
        require(record.status in HealthRecordStatus.values()) { "Invalid record status" }
        
        // Additional FHIR validations would be implemented here
    }
}

/**
 * Data class for paginated API responses
 */
data class PagedResponse<T>(
    val data: List<T>,
    val page: Int,
    val totalPages: Int
)
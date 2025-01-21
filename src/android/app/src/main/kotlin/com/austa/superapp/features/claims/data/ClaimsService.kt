package com.austa.superapp.features.claims.data

import android.util.Log
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.network.ApiClient
import com.austa.superapp.core.network.ApiEndpoints
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.core.security.EncryptedData
import com.austa.superapp.features.claims.domain.models.Claim
import com.austa.superapp.features.claims.domain.models.ClaimStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Service class for managing HIPAA-compliant insurance claims operations.
 * Implements secure data handling, encryption, and comprehensive error management.
 * Version: 1.0.0
 */
@Singleton
class ClaimsService @Inject constructor(
    private val apiClient: ApiClient,
    private val coroutineScope: CoroutineScope,
    private val encryptionManager: EncryptionManager
) {
    companion object {
        private const val TAG = "ClaimsService"
        private const val CLAIMS_CACHE_KEY = "claims_cache"
        private const val MAX_RETRY_ATTEMPTS = AppConstants.NETWORK.MAX_RETRIES
        private const val RETRY_DELAY_MS = AppConstants.NETWORK.RETRY_DELAY_MS
    }

    private val claimsApi = apiClient.createService(ClaimsApi::class.java)
    private val claimsCache = mutableMapOf<String, EncryptedData>()

    /**
     * Securely submits a new insurance claim with encryption and audit logging.
     * 
     * @param claim The claim to be submitted
     * @return Flow<Result<Claim>> Result stream of claim submission with error handling
     */
    fun submitClaim(claim: Claim): Flow<Result<Claim>> = flow {
        try {
            // Validate claim data
            require(claim.amount > 0 && claim.amount <= AppConstants.CLAIMS.MAX_CLAIM_AMOUNT) {
                "Invalid claim amount"
            }
            require(claim.documents.size <= AppConstants.CLAIMS.MAX_ATTACHMENTS) {
                "Exceeded maximum attachments limit"
            }

            // Encrypt sensitive claim data
            val encryptedClaim = encryptionManager.encryptData(
                claim.toString().toByteArray(),
                "claim_${claim.id}"
            )

            // Submit encrypted claim
            val response = claimsApi.submitClaim(
                ClaimRequest(
                    encryptedData = encryptedClaim.encryptedBytes,
                    iv = encryptedClaim.iv,
                    keyVersion = encryptedClaim.keyVersion,
                    timestamp = encryptedClaim.timestamp
                )
            )

            // Process response
            val submittedClaim = response.body()?.let { claimResponse ->
                val decryptedData = encryptionManager.decryptData(
                    EncryptedData(
                        claimResponse.encryptedData,
                        claimResponse.iv,
                        claimResponse.keyVersion,
                        claimResponse.timestamp
                    )
                )
                // Parse decrypted claim data
                Claim.fromJson(String(decryptedData))
            } ?: throw IOException("Empty response body")

            // Update cache
            claimsCache[submittedClaim.id] = encryptedClaim

            // Log successful submission
            Log.i(TAG, "Claim submitted successfully: ${submittedClaim.id}")
            
            emit(Result.success(submittedClaim))

        } catch (e: Exception) {
            Log.e(TAG, "Claim submission failed", e)
            emit(Result.failure(e))
        }
    }.retryWhen { cause, attempt ->
        attempt < MAX_RETRY_ATTEMPTS && cause is IOException
    }.catch { e ->
        Log.e(TAG, "Fatal error in claim submission", e)
        emit(Result.failure(e))
    }

    /**
     * Retrieves and decrypts a specific claim by ID with caching support.
     * 
     * @param claimId ID of the claim to retrieve
     * @return Flow<Result<Claim>> Result stream of decrypted claim data
     */
    fun getClaim(claimId: String): Flow<Result<Claim>> = flow {
        try {
            // Check cache first
            val cachedClaim = claimsCache[claimId]
            if (cachedClaim != null) {
                val decryptedClaim = encryptionManager.decryptData(cachedClaim)
                emit(Result.success(Claim.fromJson(String(decryptedClaim))))
                return@flow
            }

            // Fetch from API if not cached
            val response = claimsApi.getClaim(claimId)
            
            val claim = response.body()?.let { claimResponse ->
                val decryptedData = encryptionManager.decryptData(
                    EncryptedData(
                        claimResponse.encryptedData,
                        claimResponse.iv,
                        claimResponse.keyVersion,
                        claimResponse.timestamp
                    )
                )
                Claim.fromJson(String(decryptedData))
            } ?: throw IOException("Empty response body")

            // Update cache
            claimsCache[claimId] = EncryptedData(
                response.body()!!.encryptedData,
                response.body()!!.iv,
                response.body()!!.keyVersion,
                response.body()!!.timestamp
            )

            Log.i(TAG, "Claim retrieved successfully: $claimId")
            emit(Result.success(claim))

        } catch (e: Exception) {
            Log.e(TAG, "Claim retrieval failed", e)
            emit(Result.failure(e))
        }
    }.retryWhen { cause, attempt ->
        attempt < MAX_RETRY_ATTEMPTS && cause is IOException
    }.catch { e ->
        Log.e(TAG, "Fatal error in claim retrieval", e)
        emit(Result.failure(e))
    }

    /**
     * Updates claim status with security validation and audit logging.
     * 
     * @param claimId ID of the claim to update
     * @param newStatus New status to set
     * @return Flow<Result<Claim>> Result stream of updated claim
     */
    fun updateClaimStatus(claimId: String, newStatus: ClaimStatus): Flow<Result<Claim>> = flow {
        try {
            val currentClaim = getClaim(claimId).collect { result ->
                result.getOrNull()?.let { claim ->
                    // Validate status transition
                    require(claim.status.isValidTransition(newStatus)) {
                        "Invalid status transition: ${claim.status} -> $newStatus"
                    }

                    // Update status
                    val updatedClaim = claim.copy(status = newStatus)
                    
                    // Encrypt updated claim
                    val encryptedClaim = encryptionManager.encryptData(
                        updatedClaim.toString().toByteArray(),
                        "claim_$claimId"
                    )

                    // Submit update
                    val response = claimsApi.updateClaim(
                        claimId,
                        ClaimRequest(
                            encryptedData = encryptedClaim.encryptedBytes,
                            iv = encryptedClaim.iv,
                            keyVersion = encryptedClaim.keyVersion,
                            timestamp = encryptedClaim.timestamp
                        )
                    )

                    // Update cache
                    claimsCache[claimId] = encryptedClaim

                    Log.i(TAG, "Claim status updated: $claimId -> $newStatus")
                    emit(Result.success(updatedClaim))
                } ?: throw IOException("Claim not found: $claimId")
            }

        } catch (e: Exception) {
            Log.e(TAG, "Claim status update failed", e)
            emit(Result.failure(e))
        }
    }

    /**
     * Data class for encrypted claim requests/responses
     */
    private data class ClaimRequest(
        val encryptedData: ByteArray,
        val iv: ByteArray,
        val keyVersion: Int,
        val timestamp: Long
    )

    /**
     * Retrofit interface for claims API endpoints
     */
    private interface ClaimsApi {
        suspend fun submitClaim(request: ClaimRequest): retrofit2.Response<ClaimRequest>
        suspend fun getClaim(claimId: String): retrofit2.Response<ClaimRequest>
        suspend fun updateClaim(claimId: String, request: ClaimRequest): retrofit2.Response<ClaimRequest>
    }
}
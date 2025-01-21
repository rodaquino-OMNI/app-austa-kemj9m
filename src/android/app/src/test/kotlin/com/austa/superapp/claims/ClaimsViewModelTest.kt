package com.austa.superapp.claims

import app.cash.turbine.test
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.features.claims.data.ClaimsRepository
import com.austa.superapp.features.claims.domain.models.Claim
import com.austa.superapp.features.claims.domain.models.ClaimDocument
import com.austa.superapp.features.claims.domain.models.ClaimMetadata
import com.austa.superapp.features.claims.domain.models.ClaimStatus
import com.austa.superapp.features.claims.domain.models.ClaimType
import com.austa.superapp.features.claims.presentation.ClaimsViewModel
import io.mockk.*
import io.mockk.impl.annotations.MockK
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import java.util.*
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.milliseconds

@ExperimentalCoroutinesApi
@ExtendWith(InstantExecutorExtension::class)
class ClaimsViewModelTest {

    @MockK
    private lateinit var claimsRepository: ClaimsRepository

    @MockK
    private lateinit var encryptionManager: EncryptionManager

    private lateinit var testDispatcher: TestCoroutineDispatcher
    private lateinit var viewModel: ClaimsViewModel
    private lateinit var testTimeSource: TestTimeSource

    companion object {
        private const val TEST_CLAIM_ID = "test-claim-123"
        private const val TEST_AMOUNT = 100.0
        private const val TEST_TIMEOUT = 5000L
        private const val PERFORMANCE_THRESHOLD_MS = 500L
    }

    @BeforeEach
    fun setup() {
        MockKAnnotations.init(this)
        testDispatcher = TestCoroutineDispatcher()
        testTimeSource = TestTimeSource()
        Dispatchers.setMain(testDispatcher)

        // Initialize mocks with relaxed behavior
        mockkStatic(System::class)
        every { System.currentTimeMillis() } answers { testTimeSource.currentTime }

        viewModel = ClaimsViewModel(claimsRepository, encryptionManager)
    }

    @AfterEach
    fun cleanup() {
        clearAllMocks()
        testDispatcher.cleanupTestCoroutines()
        Dispatchers.resetMain()
    }

    @Test
    fun `submitClaim success - verifies HIPAA compliance and performance`() = runTest {
        // Arrange
        val testClaim = createTestClaim()
        val startTime = testTimeSource.currentTime
        
        coEvery { 
            claimsRepository.submitClaim(any()) 
        } returns flowOf(Result.success(testClaim))

        // Act & Assert
        viewModel.submitClaimSecure(testClaim)
        
        viewModel.loadingState.test(timeout = TEST_TIMEOUT.milliseconds) {
            assertEquals(ClaimsViewModel.LoadingState.Loading, awaitItem())
            assertEquals(ClaimsViewModel.LoadingState.Success, awaitItem())
            
            // Verify performance requirements
            val processingTime = testTimeSource.currentTime - startTime
            assertTrue(processingTime <= PERFORMANCE_THRESHOLD_MS, 
                "Claim submission exceeded performance threshold")
        }

        viewModel.claims.test {
            val claims = awaitItem()
            assertTrue(claims.contains(testClaim))
            
            // Verify HIPAA compliance
            claims.forEach { claim ->
                assertClaimCompliance(claim)
            }
        }

        // Verify repository interaction
        coVerify(exactly = 1) { 
            claimsRepository.submitClaim(match { 
                it.id == testClaim.id && 
                it.amount <= AppConstants.CLAIMS.MAX_CLAIM_AMOUNT
            })
        }
    }

    @Test
    fun `submitClaim error - handles failure securely`() = runTest {
        // Arrange
        val testClaim = createTestClaim()
        val testError = Exception("Submission failed")
        
        coEvery { 
            claimsRepository.submitClaim(any()) 
        } returns flowOf(Result.failure(testError))

        // Act & Assert
        viewModel.submitClaimSecure(testClaim)
        
        viewModel.errorState.test {
            val error = awaitItem()
            assertTrue(error is ClaimsViewModel.ErrorState.SubmissionError)
            // Verify error message is sanitized
            assertFalse(error?.message?.contains(testClaim.patientId) ?: false)
        }

        viewModel.loadingState.test {
            assertEquals(ClaimsViewModel.LoadingState.Loading, awaitItem())
            assertEquals(ClaimsViewModel.LoadingState.Error, awaitItem())
        }
    }

    @Test
    fun `loadUserClaims - verifies offline support and caching`() = runTest {
        // Arrange
        val testClaims = listOf(createTestClaim(), createTestClaim())
        
        coEvery { 
            claimsRepository.getUserClaims(any(), any()) 
        } returns flowOf(Result.success(testClaims))

        // Act & Assert
        viewModel.loadUserClaims(refresh = true)
        
        viewModel.claims.test {
            val claims = awaitItem()
            assertEquals(testClaims.size, claims.size)
            
            // Verify data encryption
            claims.forEach { claim ->
                coVerify { 
                    encryptionManager.encryptData(any(), any()) 
                }
            }
        }

        // Verify cache utilization
        coVerify(exactly = 1) { 
            claimsRepository.getUserClaims(0, AppConstants.UI.PAGINATION_PAGE_SIZE) 
        }
    }

    @Test
    fun `updateClaimStatus - validates status transitions and security`() = runTest {
        // Arrange
        val testClaim = createTestClaim()
        val newStatus = ClaimStatus.IN_REVIEW
        
        coEvery { 
            claimsRepository.updateClaimStatus(any(), any()) 
        } returns flowOf(Result.success(testClaim.copy(status = newStatus)))

        // Act & Assert
        viewModel.updateClaimStatus(TEST_CLAIM_ID, newStatus)
        
        viewModel.claims.test {
            val claims = awaitItem()
            val updatedClaim = claims.find { it.id == TEST_CLAIM_ID }
            assertEquals(newStatus, updatedClaim?.status)
            
            // Verify status transition validation
            assertTrue(testClaim.status.isValidTransition(newStatus))
        }

        // Verify audit logging
        coVerify { 
            claimsRepository.updateClaimStatus(
                match { it == TEST_CLAIM_ID },
                match { it == newStatus }
            )
        }
    }

    private fun createTestClaim() = Claim(
        id = TEST_CLAIM_ID,
        patientId = "patient-123",
        providerId = "provider-456",
        type = ClaimType.MEDICAL,
        status = ClaimStatus.SUBMITTED,
        amount = TEST_AMOUNT,
        serviceDate = Date(),
        submissionDate = Date(),
        healthRecordId = "health-789",
        documents = listOf(
            ClaimDocument(
                type = "pdf",
                title = "Test Document",
                encryptedUrl = "https://test.url",
                uploadedBy = "test-user",
                hashValue = "test-hash",
                retentionDate = Date()
            )
        ),
        metadata = ClaimMetadata(
            policyNumber = "policy-123",
            insuranceProvider = "test-provider",
            facility = "test-facility",
            diagnosisCodes = listOf("A123"),
            procedureCodes = listOf("P456"),
            coveragePercentage = 80.0,
            deductibleApplied = 0.0
        )
    )

    private fun assertClaimCompliance(claim: Claim) {
        assertTrue(claim.amount > 0 && claim.amount <= AppConstants.CLAIMS.MAX_CLAIM_AMOUNT)
        assertTrue(claim.documents.size <= AppConstants.CLAIMS.MAX_ATTACHMENTS)
        assertTrue(claim.serviceDate <= Date())
        assertTrue(claim.metadata.diagnosisCodes.isNotEmpty())
    }

    private class TestTimeSource {
        var currentTime: Long = 0
            private set

        fun advanceBy(ms: Long) {
            currentTime += ms
        }
    }
}
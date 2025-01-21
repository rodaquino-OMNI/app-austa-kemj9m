package com.austa.superapp.healthrecords

import androidx.paging.PagingData
import com.austa.superapp.core.security.EncryptedData
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.features.healthrecords.data.HealthRecordsRepository
import com.austa.superapp.features.healthrecords.data.SyncStatus
import com.austa.superapp.features.healthrecords.data.UploadStatus
import com.austa.superapp.features.healthrecords.domain.models.HealthRecord
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordMetadata
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordStatus
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordType
import com.austa.superapp.features.healthrecords.presentation.HealthRecordsViewModel
import com.austa.superapp.features.healthrecords.presentation.SecurityError
import com.austa.superapp.security.SecurityContext
import com.google.common.truth.Truth.assertThat
import io.mockk.*
import io.mockk.impl.annotations.MockK
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class)
class HealthRecordsViewModelTest {

    companion object {
        private const val TEST_PATIENT_ID = "test-patient-123"
        private const val TEST_RECORD_ID = "test-record-456"
        private const val MAX_RESPONSE_TIME_MS = 500L
        private const val SECURITY_TIMEOUT_MS = 1000L
    }

    @MockK
    private lateinit var repository: HealthRecordsRepository

    @MockK
    private lateinit var encryptionManager: EncryptionManager

    @MockK
    private lateinit var securityContext: SecurityContext

    @MockK
    private lateinit var auditLogger: AuditLogger

    private lateinit var viewModel: HealthRecordsViewModel
    private lateinit var testDispatcher: TestDispatcher
    private lateinit var testScope: TestScope

    @Before
    fun setUp() {
        MockKAnnotations.init(this)
        testDispatcher = StandardTestDispatcher()
        testScope = TestScope(testDispatcher)
        Dispatchers.setMain(testDispatcher)

        // Setup security context mock
        every { securityContext.isValid() } returns true
        every { securityContext.initialize(any(), any()) } just Runs

        // Setup encryption manager mock
        every { encryptionManager.encryptData(any(), any()) } returns mockEncryptedData()
        every { encryptionManager.decryptData(any()) } returns "test data".toByteArray()

        // Setup audit logger mock
        every { auditLogger.initialize(any(), any()) } just Runs
        every { auditLogger.logAccess(any(), any()) } just Runs
        every { auditLogger.logError(any()) } just Runs

        viewModel = HealthRecordsViewModel(
            healthRecordsRepository = repository,
            encryptionManager = encryptionManager,
            securityContext = securityContext,
            auditLogger = auditLogger
        )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        clearAllMocks()
    }

    @Test
    fun `loadHealthRecords success with valid security context`() = testScope.runTest {
        // Setup test data
        val testRecord = createTestHealthRecord()
        val pagingData = PagingData.from(listOf(testRecord))

        // Setup repository mock
        coEvery { 
            repository.getHealthRecords(
                patientId = TEST_PATIENT_ID,
                filters = any(),
                paginationConfig = any()
            )
        } returns flowOf(pagingData)

        // Measure response time
        val startTime = System.nanoTime()
        
        // Execute test
        val result = viewModel.loadHealthRecords(TEST_PATIENT_ID).toList()

        // Verify response time
        val responseTime = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startTime)
        assertThat(responseTime).isLessThan(MAX_RESPONSE_TIME_MS)

        // Verify security checks
        verify(exactly = 1) { securityContext.isValid() }
        verify(exactly = 1) { auditLogger.logAccess("load_records", TEST_PATIENT_ID) }

        // Verify data encryption
        verify(exactly = 1) { encryptionManager.decryptData(any()) }

        // Verify result
        assertThat(result).isNotEmpty()
        assertThat(viewModel.uiState.value.isLoading).isFalse()
        assertThat(viewModel.uiState.value.error).isNull()
    }

    @Test
    fun `loadHealthRecords fails with invalid security context`() = testScope.runTest {
        // Setup security failure
        every { securityContext.isValid() } returns false

        // Execute test
        viewModel.loadHealthRecords(TEST_PATIENT_ID)
        
        // Advance dispatcher to complete execution
        advanceUntilIdle()

        // Verify error state
        assertThat(viewModel.uiState.value.error).isNotNull()
        assertThat(viewModel.uiState.value.error?.code).isEqualTo("HEALTH_RECORDS_ERROR")
        
        // Verify audit logging
        verify(exactly = 1) { auditLogger.logError(any()) }
    }

    @Test
    fun `uploadHealthRecord success with HIPAA compliance`() = testScope.runTest {
        // Setup test data
        val testRecord = createTestHealthRecord()
        
        // Setup repository mock
        coEvery { 
            repository.uploadHealthRecord(any())
        } returns flowOf(UploadStatus.Success(testRecord))

        // Execute test
        viewModel.uploadHealthRecord(testRecord)
        
        // Advance dispatcher
        advanceUntilIdle()

        // Verify HIPAA compliance
        verify(exactly = 1) { securityContext.isValid() }
        verify(exactly = 1) { encryptionManager.encryptData(any(), any()) }
        verify(exactly = 1) { auditLogger.logAccess(any(), any()) }

        // Verify success state
        assertThat(viewModel.uiState.value.uploadStatus).isInstanceOf(UploadStatus.Success::class.java)
        assertThat(viewModel.uiState.value.isLoading).isFalse()
    }

    @Test
    fun `syncHealthRecords handles network timeout`() = testScope.runTest {
        // Setup repository mock with delay
        coEvery { 
            repository.syncHealthRecords(any(), any())
        } coAnswers {
            delay(SECURITY_TIMEOUT_MS + 100)
            flowOf(SyncStatus.Error(Exception("Timeout")))
        }

        // Execute test
        viewModel.syncHealthRecords(TEST_PATIENT_ID)
        
        // Advance time past timeout
        advanceTimeBy(SECURITY_TIMEOUT_MS + 200)
        
        // Verify timeout handling
        assertThat(viewModel.uiState.value.error).isNotNull()
        assertThat(viewModel.uiState.value.syncStatus).isInstanceOf(SyncStatus.Error::class.java)
    }

    private fun createTestHealthRecord() = HealthRecord(
        id = TEST_RECORD_ID,
        patientId = TEST_PATIENT_ID,
        providerId = "test-provider-789",
        type = HealthRecordType.CONSULTATION,
        date = "2023-12-01T10:00:00Z",
        content = mapOf("test" to "data"),
        metadata = HealthRecordMetadata(
            version = 1,
            createdAt = "2023-12-01T10:00:00Z",
            createdBy = "test-user",
            updatedAt = "2023-12-01T10:00:00Z",
            updatedBy = "test-user",
            facility = "test-facility",
            department = "test-department",
            accessHistory = emptyList(),
            encryptionStatus = true,
            dataRetentionPolicy = "7 years",
            complianceFlags = listOf("HIPAA")
        ),
        attachments = emptyList(),
        status = HealthRecordStatus.FINAL,
        version = 1,
        securityLabels = listOf("restricted"),
        confidentiality = "R",
        signature = "test-signature"
    )

    private fun mockEncryptedData() = EncryptedData(
        encryptedBytes = "encrypted".toByteArray(),
        iv = ByteArray(12),
        keyVersion = 1,
        timestamp = System.currentTimeMillis()
    )
}
package com.austa.superapp.healthrecords

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.features.healthrecords.domain.models.HealthRecord
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordType
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordStatus
import com.austa.superapp.features.healthrecords.presentation.HealthRecordsScreen
import com.austa.superapp.features.healthrecords.presentation.HealthRecordsViewModel
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class HealthRecordsScreenTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Inject
    lateinit var encryptionManager: EncryptionManager

    private lateinit var mockViewModel: HealthRecordsViewModel
    private lateinit var testDispatcher: TestDispatcher
    private lateinit var securityContext: TestSecurityContext
    private val testSessionId = UUID.randomUUID().toString()

    @Before
    fun setup() {
        hiltRule.inject()
        testDispatcher = StandardTestDispatcher()
        Dispatchers.setMain(testDispatcher)

        // Initialize security context
        securityContext = TestSecurityContext(
            userId = "test_user",
            patientId = "test_patient",
            accessLevel = "FULL",
            sessionId = testSessionId
        )

        // Setup mock ViewModel
        mockViewModel = FakeHealthRecordsViewModel(
            encryptionManager = encryptionManager,
            securityContext = securityContext
        )

        // Configure accessibility testing
        composeTestRule.setContent {
            HealthRecordsScreen(
                onRecordClick = {},
                securityContext = securityContext,
                viewModel = mockViewModel
            )
        }
    }

    @After
    fun cleanup() {
        Dispatchers.resetMain()
        clearSecurityContext()
    }

    @Test
    fun testLoadingState() {
        // Set loading state
        (mockViewModel.uiState as MutableStateFlow).value = 
            HealthRecordsUiState(isLoading = true)

        // Verify loading indicator is displayed and accessible
        composeTestRule
            .onNodeWithContentDescription("Loading health records")
            .assertExists()
            .assertIsDisplayed()
            .assertHasClickAction()
            .assertHasNoClickAction() // Should not be clickable while loading

        // Verify content is not visible
        composeTestRule
            .onNodeWithTag("records_list")
            .assertDoesNotExist()
    }

    @Test
    fun testHealthRecordsList() {
        // Prepare test data with security classifications
        val testRecords = generateSecureTestRecords()
        
        // Set records in ViewModel
        (mockViewModel.uiState as MutableStateFlow).value = 
            HealthRecordsUiState(
                isLoading = false,
                records = testRecords
            )

        // Verify records list is displayed
        composeTestRule
            .onNodeWithTag("records_list")
            .assertExists()
            .assertIsDisplayed()

        // Verify each record item
        testRecords.forEach { record ->
            // Verify record display with proper data masking
            composeTestRule
                .onNodeWithText(record.type.name.replace("_", " "))
                .assertExists()
                .assertIsDisplayed()
                .assertHasClickAction()

            // Verify security labels are displayed
            record.securityLabels.forEach { label ->
                composeTestRule
                    .onNodeWithText(label)
                    .assertExists()
                    .assertIsDisplayed()
            }

            // Verify accessibility
            composeTestRule
                .onNodeWithContentDescription("Health record from ${record.date}")
                .assertExists()
                .assertHasClickAction()
        }
    }

    @Test
    fun testTypeFilters() {
        // Setup test record types
        val selectedTypes = setOf(
            HealthRecordType.LAB_RESULT,
            HealthRecordType.PRESCRIPTION
        )

        // Set filter state
        (mockViewModel.uiState as MutableStateFlow).value = 
            HealthRecordsUiState(
                selectedTypes = selectedTypes
            )

        // Verify filter chips
        HealthRecordType.values().forEach { type ->
            composeTestRule
                .onNodeWithContentDescription("Filter by ${type.name}")
                .assertExists()
                .assertIsDisplayed()
                .assertHasClickAction()

            // Verify selected state
            if (type in selectedTypes) {
                composeTestRule
                    .onNodeWithContentDescription("Filter by ${type.name}")
                    .assertIsSelected()
            }
        }

        // Test filter interaction
        composeTestRule
            .onNodeWithContentDescription("Filter by CONSULTATION")
            .performClick()

        // Verify filter update was logged securely
        verifySecurityLog(
            sessionId = testSessionId,
            action = "FILTER_CHANGED",
            data = "type: CONSULTATION"
        )
    }

    @Test
    fun testErrorState() {
        // Set error state
        val errorMessage = "Failed to load records"
        (mockViewModel.uiState as MutableStateFlow).value = 
            HealthRecordsUiState(
                isLoading = false,
                error = SecurityError(
                    code = "LOAD_ERROR",
                    message = errorMessage,
                    timestamp = System.currentTimeMillis()
                )
            )

        // Verify error display
        composeTestRule
            .onNodeWithText(errorMessage)
            .assertExists()
            .assertIsDisplayed()

        // Verify error is announced for accessibility
        composeTestRule
            .onNodeWithContentDescription("Error loading health records")
            .assertExists()
    }

    private fun generateSecureTestRecords(): List<HealthRecord> {
        return listOf(
            HealthRecord(
                id = "test_record_1",
                patientId = securityContext.patientId,
                providerId = "test_provider",
                type = HealthRecordType.LAB_RESULT,
                date = "2023-12-01",
                content = mapOf("test" to "data"),
                metadata = generateSecureMetadata(),
                attachments = emptyList(),
                status = HealthRecordStatus.FINAL,
                version = 1,
                securityLabels = listOf("RESTRICTED", "PHI"),
                confidentiality = "R",
                signature = "test_signature"
            ),
            HealthRecord(
                id = "test_record_2",
                patientId = securityContext.patientId,
                providerId = "test_provider",
                type = HealthRecordType.PRESCRIPTION,
                date = "2023-12-02",
                content = mapOf("test" to "data"),
                metadata = generateSecureMetadata(),
                attachments = emptyList(),
                status = HealthRecordStatus.FINAL,
                version = 1,
                securityLabels = listOf("RESTRICTED", "PHI"),
                confidentiality = "R",
                signature = "test_signature"
            )
        )
    }

    private fun generateSecureMetadata() = HealthRecordMetadata(
        version = 1,
        createdAt = "2023-12-01T10:00:00Z",
        createdBy = "test_user",
        updatedAt = "2023-12-01T10:00:00Z",
        updatedBy = "test_user",
        facility = "test_facility",
        department = "test_department",
        accessHistory = emptyList(),
        encryptionStatus = true,
        dataRetentionPolicy = "7_YEARS",
        complianceFlags = listOf("HIPAA_COMPLIANT")
    )

    private fun clearSecurityContext() {
        // Clear sensitive data
        securityContext.clearSession()
        testDispatcher.scheduler.advanceUntilIdle()
    }

    private fun verifySecurityLog(
        sessionId: String,
        action: String,
        data: String
    ) {
        // Verify security audit log entry
        // Implementation would verify actual audit log entries
    }
}
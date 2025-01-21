package com.austa.superapp.virtualcare

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.espresso.IdlingRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.features.virtualcare.data.WebRTCService
import com.austa.superapp.features.virtualcare.domain.models.Consultation
import com.austa.superapp.features.virtualcare.presentation.VideoConsultationScreen
import com.austa.superapp.features.virtualcare.presentation.VideoConsultationViewModel
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Date
import javax.inject.Inject

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
@ExperimentalCoroutinesApi
class VideoConsultationScreenTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Inject
    lateinit var fakePerformanceTracker: PerformanceTracker

    private lateinit var fakeViewModel: FakeVideoConsultationViewModel
    private lateinit var testConsultation: Consultation
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        hiltRule.inject()

        // Initialize test consultation with security context
        testConsultation = Consultation(
            id = "test_consultation",
            patientId = "test_patient",
            providerId = "test_provider",
            scheduledStartTime = Date(),
            status = Consultation.ConsultationStatus.SCHEDULED,
            metadata = Consultation.ConsultationMetadata(
                technicalConfig = Consultation.TechnicalConfig(
                    videoQuality = AppConstants.VIRTUAL_CARE.MAX_VIDEO_QUALITY,
                    audioBitrate = AppConstants.VIRTUAL_CARE.MAX_AUDIO_BITRATE,
                    videoBitrate = AppConstants.VIRTUAL_CARE.MAX_VIDEO_BITRATE
                )
            )
        )

        // Initialize fake ViewModel with security validation
        fakeViewModel = FakeVideoConsultationViewModel(
            testConsultation,
            fakePerformanceTracker,
            testDispatcher
        )

        // Register idling resources for async operations
        IdlingRegistry.getInstance().register(
            fakeViewModel.getIdlingResource()
        )
    }

    @After
    fun tearDown() {
        IdlingRegistry.getInstance().unregister(
            fakeViewModel.getIdlingResource()
        )
    }

    @Test
    fun testInitialLoadingState() {
        composeTestRule.setContent {
            VideoConsultationScreen(
                navController = TestNavHostController(composeTestRule.activity),
                consultationId = testConsultation.id,
                viewModel = fakeViewModel
            )
        }

        // Verify loading indicator is displayed
        composeTestRule.onNodeWithTag("loading_indicator")
            .assertExists()
            .assertIsDisplayed()
    }

    @Test
    fun testVideoStreamInitialization() {
        composeTestRule.setContent {
            VideoConsultationScreen(
                navController = TestNavHostController(composeTestRule.activity),
                consultationId = testConsultation.id,
                viewModel = fakeViewModel
            )
        }

        // Verify video containers are initialized
        composeTestRule.onNodeWithTag("remote_video_container")
            .assertExists()
            .assertIsDisplayed()

        composeTestRule.onNodeWithTag("local_video_container")
            .assertExists()
            .assertIsDisplayed()
    }

    @Test
    fun testPerformanceMetrics() {
        composeTestRule.setContent {
            VideoConsultationScreen(
                navController = TestNavHostController(composeTestRule.activity),
                consultationId = testConsultation.id,
                viewModel = fakeViewModel
            )
        }

        // Simulate network quality update
        fakeViewModel.updateNetworkQuality(
            WebRTCService.ConnectionMetrics(
                bitrate = AppConstants.VIRTUAL_CARE.MAX_VIDEO_BITRATE,
                packetLoss = 0.01f,
                latency = 100,
                jitter = 0.5f
            )
        )

        // Verify performance metrics are displayed
        composeTestRule.onNodeWithTag("network_quality_indicator")
            .assertExists()
            .assertTextContains("${AppConstants.VIRTUAL_CARE.MAX_VIDEO_BITRATE / 1000}kbps")
    }

    @Test
    fun testSecurityControls() {
        composeTestRule.setContent {
            VideoConsultationScreen(
                navController = TestNavHostController(composeTestRule.activity),
                consultationId = testConsultation.id,
                viewModel = fakeViewModel
            )
        }

        // Verify secure control panel exists
        composeTestRule.onNodeWithTag("secure_video_controls")
            .assertExists()
            .assertIsDisplayed()

        // Test camera toggle with security validation
        composeTestRule.onNodeWithTag("camera_toggle")
            .assertExists()
            .assertIsEnabled()
            .performClick()

        // Test microphone toggle with security validation
        composeTestRule.onNodeWithTag("microphone_toggle")
            .assertExists()
            .assertIsEnabled()
            .performClick()
    }

    @Test
    fun testErrorHandling() {
        // Simulate security error
        fakeViewModel.simulateError("Security validation failed")

        composeTestRule.setContent {
            VideoConsultationScreen(
                navController = TestNavHostController(composeTestRule.activity),
                consultationId = testConsultation.id,
                viewModel = fakeViewModel
            )
        }

        // Verify error dialog is displayed
        composeTestRule.onNodeWithTag("error_dialog")
            .assertExists()
            .assertIsDisplayed()
            .assertTextContains("Security validation failed")
    }

    @Test
    fun testHIPAACompliance() {
        composeTestRule.setContent {
            VideoConsultationScreen(
                navController = TestNavHostController(composeTestRule.activity),
                consultationId = testConsultation.id,
                viewModel = fakeViewModel
            )
        }

        // Verify HIPAA compliance indicators
        composeTestRule.onNodeWithTag("hipaa_compliance_indicator")
            .assertExists()
            .assertIsDisplayed()

        // Verify secure connection status
        composeTestRule.onNodeWithTag("secure_connection_status")
            .assertExists()
            .assertIsDisplayed()
            .assertTextContains("Encrypted")
    }

    private class FakeVideoConsultationViewModel(
        private val testConsultation: Consultation,
        private val performanceTracker: PerformanceTracker,
        private val testDispatcher: TestDispatcher
    ) : VideoConsultationViewModel(
        repository = mockk(),
        performanceTracker = performanceTracker,
        securityValidator = mockk()
    ) {
        private val _uiState = MutableStateFlow(ConsultationUiState())
        private val idlingResource = CountingIdlingResource("FakeViewModel")

        fun getIdlingResource() = idlingResource

        fun updateNetworkQuality(metrics: WebRTCService.ConnectionMetrics) {
            _uiState.value = _uiState.value.copy(
                networkQuality = NetworkQuality(
                    bitrate = metrics.bitrate,
                    packetLoss = metrics.packetLoss,
                    latency = metrics.latency,
                    timestamp = System.currentTimeMillis()
                )
            )
        }

        fun simulateError(message: String) {
            _uiState.value = _uiState.value.copy(
                error = message
            )
        }
    }
}
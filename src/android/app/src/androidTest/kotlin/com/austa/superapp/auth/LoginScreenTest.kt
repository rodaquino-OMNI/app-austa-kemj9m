package com.austa.superapp.auth

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.navigation.testing.TestNavHostController
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.security.BiometricManager
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.core.testing.AccessibilityValidator
import com.austa.superapp.core.testing.SecurityLogger
import com.austa.superapp.features.auth.presentation.LoginScreen
import com.austa.superapp.features.auth.presentation.LoginViewModel
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import javax.inject.Inject

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
@ExperimentalCoroutinesApi
class LoginScreenTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Inject
    lateinit var encryptionManager: EncryptionManager

    private lateinit var navController: TestNavHostController
    private lateinit var viewModel: LoginViewModel
    private lateinit var biometricManager: BiometricManager
    private lateinit var securityLogger: SecurityLogger
    private lateinit var accessibilityValidator: AccessibilityValidator

    @Before
    fun setup() {
        hiltRule.inject()

        // Initialize mocks and test components
        navController = TestNavHostController(InstrumentationRegistry.getInstrumentation().targetContext)
        viewModel = mockk(relaxed = true)
        biometricManager = mockk(relaxed = true)
        securityLogger = mockk(relaxed = true)
        accessibilityValidator = mockk(relaxed = true)

        // Setup biometric capability check
        coEvery { biometricManager.checkBiometricCapability() } returns 
            BiometricManager.BiometricCapabilityResult.Available

        // Setup compose test rule
        composeTestRule.setContent {
            LoginScreen(
                navController = navController,
                viewModel = viewModel
            )
        }
    }

    @Test
    fun testLoginScreenInitialState() {
        // Verify initial UI state
        composeTestRule.onNodeWithTag("emailInput")
            .assertExists()
            .assertIsEnabled()
            .assertTextContains("")

        composeTestRule.onNodeWithTag("passwordInput")
            .assertExists()
            .assertIsEnabled()
            .assertTextContains("")

        composeTestRule.onNodeWithTag("loginButton")
            .assertExists()
            .assertIsNotEnabled()

        // Verify accessibility labels
        composeTestRule.onNodeWithContentDescription("Email Input Field")
            .assertExists()
            .assertHasClickAction()

        composeTestRule.onNodeWithContentDescription("Password Input Field")
            .assertExists()
            .assertHasClickAction()

        // Verify security features
        verify { securityLogger.logScreenAccess("LoginScreen") }
    }

    @Test
    fun testLoginValidation() = runTest {
        // Test email validation
        composeTestRule.onNodeWithTag("emailInput")
            .performTextInput("invalid-email")

        composeTestRule.onNodeWithTag("loginButton").performClick()
        
        composeTestRule.onNodeWithText("Invalid email format")
            .assertExists()

        // Test password validation
        composeTestRule.onNodeWithTag("passwordInput")
            .performTextInput("weak")

        composeTestRule.onNodeWithText("Password must be at least ${AppConstants.SECURITY.PASSWORD_MIN_LENGTH} characters")
            .assertExists()

        // Test SQL injection prevention
        composeTestRule.onNodeWithTag("emailInput")
            .performTextClearance()
            .performTextInput("' OR '1'='1")

        verify { securityLogger.logSecurityEvent("SQL_INJECTION_ATTEMPT") }
    }

    @Test
    fun testBiometricAuthentication() = runTest {
        // Setup biometric mock
        coEvery { biometricManager.authenticateUser(any(), any(), any(), any()) } returns
            BiometricManager.AuthenticationResult.Success(null)

        composeTestRule.onNodeWithTag("biometricButton")
            .assertExists()
            .assertIsEnabled()
            .performClick()

        verify { viewModel.authenticateWithBiometric() }
    }

    @Test
    fun testRateLimiting() = runTest {
        // Attempt multiple failed logins
        repeat(AppConstants.SECURITY.MAX_LOGIN_ATTEMPTS + 1) {
            composeTestRule.onNodeWithTag("emailInput")
                .performTextInput("test@example.com")
            composeTestRule.onNodeWithTag("passwordInput")
                .performTextInput("password123")
            composeTestRule.onNodeWithTag("loginButton")
                .performClick()
        }

        composeTestRule.onNodeWithText("Too many attempts. Please try again later.")
            .assertExists()

        verify { securityLogger.logSecurityEvent("RATE_LIMIT_EXCEEDED") }
    }

    @Test
    fun testAccessibilityCompliance() {
        // Test screen reader support
        composeTestRule.onNodeWithTag("emailInput")
            .assertHasSetTextAction()
            .assertContentDescriptionContains("Email Input Field")

        // Test touch target sizes
        composeTestRule.onNodeWithTag("loginButton")
            .assertHeightIsAtLeast(48.dp)
            .assertWidthIsAtLeast(48.dp)

        // Test color contrast
        accessibilityValidator.assertContrastRatio(
            composeTestRule.onNodeWithTag("loginButton"),
            minimumRatio = 4.5f
        )

        // Test keyboard navigation
        composeTestRule.onNodeWithTag("emailInput")
            .performClick()
            .assertImeAction(androidx.compose.ui.text.input.ImeAction.Next)

        composeTestRule.onNodeWithTag("passwordInput")
            .assertImeAction(androidx.compose.ui.text.input.ImeAction.Done)
    }

    @Test
    fun testErrorHandling() = runTest {
        // Test network error
        coEvery { viewModel.login(any(), any()) } throws Exception("Network error")

        composeTestRule.onNodeWithTag("emailInput")
            .performTextInput("test@example.com")
        composeTestRule.onNodeWithTag("passwordInput")
            .performTextInput("ValidP@ssw0rd123")
        composeTestRule.onNodeWithTag("loginButton")
            .performClick()

        composeTestRule.onNodeWithText("Network error")
            .assertExists()

        // Test error announcement for screen readers
        composeTestRule.onNodeWithContentDescription("Error Message: Network error")
            .assertExists()
    }

    @Test
    fun testSecurityLogging() = runTest {
        // Test successful login logging
        composeTestRule.onNodeWithTag("emailInput")
            .performTextInput("test@example.com")
        composeTestRule.onNodeWithTag("passwordInput")
            .performTextInput("ValidP@ssw0rd123")
        composeTestRule.onNodeWithTag("loginButton")
            .performClick()

        verify { securityLogger.logAuthenticationAttempt("test@example.com", true) }

        // Test failed login logging
        coEvery { viewModel.login(any(), any()) } throws Exception("Invalid credentials")
        composeTestRule.onNodeWithTag("loginButton")
            .performClick()

        verify { securityLogger.logAuthenticationAttempt("test@example.com", false) }
    }

    @Test
    fun testMfaFlow() = runTest {
        // Setup MFA trigger
        coEvery { viewModel.login(any(), any()) } answers {
            viewModel.handleMfaChallenge(User.MFAMethod.SMS)
        }

        composeTestRule.onNodeWithTag("emailInput")
            .performTextInput("test@example.com")
        composeTestRule.onNodeWithTag("passwordInput")
            .performTextInput("ValidP@ssw0rd123")
        composeTestRule.onNodeWithTag("loginButton")
            .performClick()

        verify { navController.navigate("mfa/SMS") }
    }
}
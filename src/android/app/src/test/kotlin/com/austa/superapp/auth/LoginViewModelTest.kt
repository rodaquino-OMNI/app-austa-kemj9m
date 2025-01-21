package com.austa.superapp.auth

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.network.NetworkMonitor
import com.austa.superapp.core.security.BiometricManager
import com.austa.superapp.core.security.BiometricManager.AuthenticationResult
import com.austa.superapp.core.security.BiometricManager.BiometricCapabilityResult
import com.austa.superapp.features.auth.data.AuthRepository
import com.austa.superapp.features.auth.data.AuthService.AuthState
import com.austa.superapp.features.auth.domain.models.User
import com.austa.superapp.features.auth.presentation.LoginState
import com.austa.superapp.features.auth.presentation.LoginUiEvent
import com.austa.superapp.features.auth.presentation.LoginViewModel
import com.austa.superapp.features.auth.presentation.SessionManager
import io.mockk.*
import io.mockk.impl.annotations.MockK
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import java.util.Date

@ExperimentalCoroutinesApi
class LoginViewModelTest {

    @MockK
    private lateinit var authRepository: AuthRepository

    @MockK
    private lateinit var biometricManager: BiometricManager

    @MockK
    private lateinit var sessionManager: SessionManager

    @MockK
    private lateinit var networkMonitor: NetworkMonitor

    private lateinit var savedStateHandle: SavedStateHandle
    private lateinit var viewModel: LoginViewModel
    private lateinit var testDispatcher: TestDispatcher

    companion object {
        private const val TEST_EMAIL = "test@example.com"
        private const val TEST_PASSWORD = "Password123!"
        private const val TEST_MFA_TOKEN = "123456"
        private const val TEST_BIOMETRIC_PROMPT = "Authenticate to access AUSTA SuperApp"
        private const val TEST_ERROR_MESSAGE = "Invalid credentials"
    }

    @BeforeEach
    fun setup() {
        MockKAnnotations.init(this)
        testDispatcher = StandardTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        savedStateHandle = SavedStateHandle()

        // Setup default mock behaviors
        coEvery { networkMonitor.isConnected() } returns true
        coEvery { sessionManager.sessionStatus } returns flowOf()
        
        viewModel = LoginViewModel(
            authRepository = authRepository,
            biometricManager = biometricManager,
            sessionManager = sessionManager,
            networkMonitor = networkMonitor,
            savedStateHandle = savedStateHandle
        )
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
        clearAllMocks()
    }

    @Test
    fun `login with valid credentials should emit success state`() = runTest {
        // Arrange
        val mockUser = createMockUser()
        coEvery { 
            authRepository.login(TEST_EMAIL, TEST_PASSWORD) 
        } returns flowOf(Result.success(mockUser))
        coEvery { sessionManager.startSession(mockUser) } just Runs

        // Act & Assert
        viewModel.loginState.test {
            viewModel.login(TEST_EMAIL, TEST_PASSWORD)
            advanceUntilIdle()

            val states = mutableListOf<LoginState>()
            while (!awaitComplete()) {
                states.add(awaitItem())
            }

            assertTrue(states.any { it.isLoading })
            assertTrue(states.last().isAuthenticated)
            assertNull(states.last().error)
        }

        viewModel.uiEvents.test {
            assertEquals(LoginUiEvent.LoginSuccess, awaitItem())
        }

        coVerify { 
            authRepository.login(TEST_EMAIL, TEST_PASSWORD)
            sessionManager.startSession(mockUser)
        }
    }

    @Test
    fun `login with invalid credentials should emit error state`() = runTest {
        // Arrange
        coEvery { 
            authRepository.login(TEST_EMAIL, TEST_PASSWORD) 
        } returns flowOf(Result.failure(IllegalArgumentException(TEST_ERROR_MESSAGE)))

        // Act & Assert
        viewModel.loginState.test {
            viewModel.login(TEST_EMAIL, TEST_PASSWORD)
            advanceUntilIdle()

            val states = mutableListOf<LoginState>()
            while (!awaitComplete()) {
                states.add(awaitItem())
            }

            assertTrue(states.any { it.isLoading })
            assertFalse(states.last().isAuthenticated)
            assertEquals(TEST_ERROR_MESSAGE, states.last().error)
        }

        viewModel.uiEvents.test {
            assertEquals(LoginUiEvent.Error(TEST_ERROR_MESSAGE), awaitItem())
        }
    }

    @Test
    fun `login with MFA required should emit MFA state`() = runTest {
        // Arrange
        val mockUser = createMockUser()
        coEvery { 
            authRepository.login(TEST_EMAIL, TEST_PASSWORD) 
        } returns flowOf(Result.success(mockUser))
        coEvery { 
            authRepository.verifyMfa(TEST_MFA_TOKEN) 
        } returns flowOf(Result.success(mockUser))

        // Act & Assert
        viewModel.loginState.test {
            viewModel.login(TEST_EMAIL, TEST_PASSWORD)
            advanceUntilIdle()

            val states = mutableListOf<LoginState>()
            while (!awaitComplete()) {
                states.add(awaitItem())
            }

            assertTrue(states.any { it.isMfaRequired })
            assertEquals(AppConstants.SECURITY.MAX_LOGIN_ATTEMPTS, states.last().remainingAttempts)
        }

        viewModel.uiEvents.test {
            assertEquals(
                LoginUiEvent.MfaRequired(User.MFAMethod.AUTHENTICATOR), 
                awaitItem()
            )
        }
    }

    @Test
    fun `biometric authentication should validate hardware security`() = runTest {
        // Arrange
        coEvery { 
            biometricManager.checkBiometricCapability() 
        } returns BiometricCapabilityResult.Available
        
        coEvery { 
            biometricManager.authenticateUser(any(), any(), any(), any()) 
        } returns flowOf(AuthenticationResult.Success(null))

        // Act & Assert
        viewModel.loginState.test {
            viewModel.authenticateWithBiometric()
            advanceUntilIdle()

            val states = mutableListOf<LoginState>()
            while (!awaitComplete()) {
                states.add(awaitItem())
            }

            assertTrue(states.any { it.isBiometricAvailable })
            assertFalse(states.last().isLoading)
        }

        coVerify { 
            biometricManager.checkBiometricCapability()
            biometricManager.authenticateUser(any(), any(), any(), any())
        }
    }

    @Test
    fun `offline login should work when network unavailable`() = runTest {
        // Arrange
        coEvery { networkMonitor.isConnected() } returns false
        coEvery { 
            authRepository.authenticateOffline(TEST_EMAIL, TEST_PASSWORD) 
        } returns flowOf(Result.success(createMockUser()))

        // Act & Assert
        viewModel.loginState.test {
            viewModel.login(TEST_EMAIL, TEST_PASSWORD)
            advanceUntilIdle()

            val states = mutableListOf<LoginState>()
            while (!awaitComplete()) {
                states.add(awaitItem())
            }

            assertTrue(states.last().isOfflineMode)
            assertTrue(states.last().isAuthenticated)
        }

        viewModel.uiEvents.test {
            assertEquals(LoginUiEvent.OfflineLoginSuccess, awaitItem())
        }
    }

    @Test
    fun `login should respect rate limiting`() = runTest {
        // Arrange
        repeat(AppConstants.SECURITY.MAX_LOGIN_ATTEMPTS + 1) {
            coEvery { 
                authRepository.login(TEST_EMAIL, TEST_PASSWORD) 
            } returns flowOf(Result.failure(IllegalArgumentException(TEST_ERROR_MESSAGE)))
        }

        // Act & Assert
        repeat(AppConstants.SECURITY.MAX_LOGIN_ATTEMPTS + 1) {
            viewModel.login(TEST_EMAIL, TEST_PASSWORD)
            advanceUntilIdle()
        }

        viewModel.loginState.test {
            val state = awaitItem()
            assertEquals(0, state.remainingAttempts)
            assertNotNull(state.error)
        }

        viewModel.uiEvents.test {
            assertTrue(awaitItem() is LoginUiEvent.Error)
        }
    }

    private fun createMockUser() = User(
        id = "test_id",
        email = TEST_EMAIL,
        password = TEST_PASSWORD,
        role = User.UserRole.PATIENT,
        status = User.UserStatus.ACTIVE,
        profile = User.UserProfile(
            firstName = "Test",
            lastName = "User",
            dateOfBirth = Date(),
            phoneNumber = "+1234567890",
            socialSecurityNumber = null,
            address = User.Address(
                streetLine1 = "123 Test St",
                streetLine2 = null,
                city = "Test City",
                state = "TS",
                postalCode = "12345",
                country = "Test Country"
            ),
            emergencyContact = null
        ),
        securitySettings = User.UserSecuritySettings(),
        auditInfo = User.AuditInfo()
    )
}
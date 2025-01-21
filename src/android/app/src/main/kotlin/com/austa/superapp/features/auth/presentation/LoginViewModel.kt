package com.austa.superapp.features.auth.presentation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.utils.ValidationUtils
import com.austa.superapp.features.auth.domain.models.User
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.retry
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.Date
import javax.inject.Inject

/**
 * Enhanced ViewModel for managing secure login operations with comprehensive security features
 * including MFA, biometric authentication, and offline support.
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val biometricManager: BiometricManager,
    private val sessionManager: SessionManager,
    private val networkMonitor: NetworkMonitor,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val _loginState = MutableStateFlow(LoginState())
    val loginState: StateFlow<LoginState> = _loginState.asStateFlow()

    private val _uiEvents = MutableSharedFlow<LoginUiEvent>()
    val uiEvents: SharedFlow<LoginUiEvent> = _uiEvents.asSharedFlow()

    private val rateLimiter = RateLimiter(
        maxAttempts = AppConstants.SECURITY.MAX_LOGIN_ATTEMPTS,
        lockoutDuration = AppConstants.SECURITY.LOCKOUT_DURATION_MINUTES
    )

    init {
        setupSecurityMonitoring()
        restoreLoginState()
    }

    /**
     * Performs secure login with comprehensive validation and security checks
     */
    fun login(email: String, password: String) {
        viewModelScope.launch {
            try {
                // Check rate limiting
                if (!rateLimiter.checkAllowed()) {
                    _uiEvents.emit(LoginUiEvent.Error("Too many attempts. Please try again later."))
                    return@launch
                }

                // Validate inputs
                val emailValidation = ValidationUtils.validateEmail(email)
                val passwordValidation = ValidationUtils.validatePassword(password)

                if (!emailValidation.isValid || !passwordValidation.isValid) {
                    val errors = (emailValidation.errors + passwordValidation.errors).joinToString("\n")
                    _uiEvents.emit(LoginUiEvent.Error(errors))
                    return@launch
                }

                _loginState.value = _loginState.value.copy(isLoading = true)

                // Check network connectivity
                if (!networkMonitor.isConnected()) {
                    handleOfflineLogin(email, password)
                    return@launch
                }

                // Attempt online authentication
                val result = authRepository.login(email, password)
                    .retry(AppConstants.NETWORK.MAX_RETRIES) {
                        // Log authentication retry attempt
                        Timber.w("Login retry attempt due to: $it")
                        true
                    }

                when {
                    result.mfaRequired -> handleMfaRequired(result)
                    result.biometricRequired -> handleBiometricRequired(result)
                    result.success -> handleSuccessfulLogin(result)
                    else -> handleFailedLogin("Authentication failed")
                }

            } catch (e: Exception) {
                Timber.e(e, "Login failed")
                handleFailedLogin(e.message ?: "An unexpected error occurred")
            } finally {
                _loginState.value = _loginState.value.copy(isLoading = false)
            }
        }
    }

    /**
     * Handles MFA verification process
     */
    fun verifyMfa(code: String) {
        viewModelScope.launch {
            try {
                _loginState.value = _loginState.value.copy(isLoading = true)
                
                val result = authRepository.verifyMfa(code)
                if (result.success) {
                    handleSuccessfulLogin(result)
                } else {
                    _uiEvents.emit(LoginUiEvent.Error("Invalid MFA code"))
                }
            } catch (e: Exception) {
                Timber.e(e, "MFA verification failed")
                _uiEvents.emit(LoginUiEvent.Error(e.message ?: "MFA verification failed"))
            } finally {
                _loginState.value = _loginState.value.copy(isLoading = false)
            }
        }
    }

    /**
     * Handles biometric authentication
     */
    fun authenticateWithBiometric() {
        viewModelScope.launch {
            try {
                _loginState.value = _loginState.value.copy(isLoading = true)
                
                val result = biometricManager.authenticate()
                if (result.success) {
                    val credentials = sessionManager.getStoredCredentials()
                    credentials?.let { login(it.email, it.password) }
                } else {
                    _uiEvents.emit(LoginUiEvent.Error("Biometric authentication failed"))
                }
            } catch (e: Exception) {
                Timber.e(e, "Biometric authentication failed")
                _uiEvents.emit(LoginUiEvent.Error(e.message ?: "Biometric authentication failed"))
            } finally {
                _loginState.value = _loginState.value.copy(isLoading = false)
            }
        }
    }

    private fun handleOfflineLogin(email: String, password: String) {
        viewModelScope.launch {
            val offlineAuth = authRepository.authenticateOffline(email, password)
            if (offlineAuth.success) {
                _loginState.value = _loginState.value.copy(
                    isAuthenticated = true,
                    isOfflineMode = true
                )
                _uiEvents.emit(LoginUiEvent.OfflineLoginSuccess)
            } else {
                handleFailedLogin("Offline authentication failed")
            }
        }
    }

    private fun handleMfaRequired(result: AuthResult) {
        _loginState.value = _loginState.value.copy(
            isMfaRequired = true,
            remainingAttempts = AppConstants.SECURITY.MAX_LOGIN_ATTEMPTS
        )
        viewModelScope.launch {
            _uiEvents.emit(LoginUiEvent.MfaRequired(result.mfaMethod))
        }
    }

    private fun handleBiometricRequired(result: AuthResult) {
        _loginState.value = _loginState.value.copy(
            isBiometricAvailable = true
        )
        viewModelScope.launch {
            _uiEvents.emit(LoginUiEvent.BiometricRequired)
        }
    }

    private fun handleSuccessfulLogin(result: AuthResult) {
        viewModelScope.launch {
            sessionManager.startSession(result.user)
            rateLimiter.reset()
            
            _loginState.value = _loginState.value.copy(
                isAuthenticated = true,
                isOfflineMode = false,
                error = null
            )
            
            // Log successful login
            Timber.i("Successful login for user: ${result.user.id}")
            _uiEvents.emit(LoginUiEvent.LoginSuccess)
        }
    }

    private fun handleFailedLogin(error: String) {
        viewModelScope.launch {
            rateLimiter.recordFailedAttempt()
            
            _loginState.value = _loginState.value.copy(
                error = error,
                remainingAttempts = rateLimiter.remainingAttempts
            )
            
            // Log failed attempt
            Timber.w("Failed login attempt. Remaining attempts: ${rateLimiter.remainingAttempts}")
            _uiEvents.emit(LoginUiEvent.Error(error))
        }
    }

    private fun setupSecurityMonitoring() {
        viewModelScope.launch {
            sessionManager.sessionStatus.collect { status ->
                when (status) {
                    is SessionStatus.Expired -> handleSessionExpired()
                    is SessionStatus.Terminated -> handleSessionTerminated()
                    else -> Unit
                }
            }
        }
    }

    private fun restoreLoginState() {
        savedStateHandle.get<LoginState>(LOGIN_STATE_KEY)?.let { state ->
            _loginState.value = state
        }
    }

    private fun handleSessionExpired() {
        viewModelScope.launch {
            _uiEvents.emit(LoginUiEvent.SessionExpired)
        }
    }

    private fun handleSessionTerminated() {
        viewModelScope.launch {
            _uiEvents.emit(LoginUiEvent.SessionTerminated)
        }
    }

    override fun onCleared() {
        super.onCleared()
        savedStateHandle[LOGIN_STATE_KEY] = _loginState.value
    }

    companion object {
        private const val LOGIN_STATE_KEY = "login_state"
    }
}

data class LoginState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val isAuthenticated: Boolean = false,
    val isBiometricAvailable: Boolean = false,
    val isMfaRequired: Boolean = false,
    val isOfflineMode: Boolean = false,
    val remainingAttempts: Int = AppConstants.SECURITY.MAX_LOGIN_ATTEMPTS
)

sealed class LoginUiEvent {
    object LoginSuccess : LoginUiEvent()
    object OfflineLoginSuccess : LoginUiEvent()
    object SessionExpired : LoginUiEvent()
    object SessionTerminated : LoginUiEvent()
    object BiometricRequired : LoginUiEvent()
    data class MfaRequired(val method: User.MFAMethod) : LoginUiEvent()
    data class Error(val message: String) : LoginUiEvent()
}
package com.austa.superapp.features.auth.data

import android.util.Log
import androidx.fragment.app.FragmentActivity
import com.austa.superapp.core.constants.AppConstants.SECURITY
import com.austa.superapp.core.storage.SecurePreferences
import com.austa.superapp.core.utils.ValidationUtils
import com.austa.superapp.features.auth.domain.models.User
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * HIPAA-compliant repository implementation for authentication operations.
 * Provides secure authentication state management with comprehensive audit logging.
 * Version: 1.0.0
 */
@Singleton
class AuthRepository @Inject constructor(
    private val authService: AuthService,
    private val securePreferences: SecurePreferences
) {
    companion object {
        private const val TAG = "AuthRepository"
        private const val PREF_KEY_AUTH_TOKEN = "auth_token_encrypted"
        private const val PREF_KEY_USER_EMAIL = "user_email_encrypted"
        private const val PREF_KEY_SESSION = "session_data_encrypted"
        private const val MAX_LOGIN_ATTEMPTS = SECURITY.MAX_LOGIN_ATTEMPTS
        private const val SESSION_TIMEOUT_MINUTES = SECURITY.SESSION_TIMEOUT_MINUTES
    }

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser

    private var sessionExpiryTime: Long = 0
    private var failedLoginAttempts = 0
    private var lastFailedLoginTime: Long = 0

    /**
     * Authenticates user with enhanced security validation and HIPAA compliance.
     *
     * @param email User's email address
     * @param password User's password
     * @return Flow<Result<User>> Authentication result with security context
     */
    fun login(email: String, password: String): Flow<Result<User>> = flow {
        try {
            // Check for account lockout
            if (isLockedOut()) {
                val remainingLockoutTime = calculateRemainingLockoutTime()
                emit(Result.failure(SecurityException("Account locked. Try again in $remainingLockoutTime minutes.")))
                return@flow
            }

            // Validate credentials
            val emailValidation = ValidationUtils.validateEmail(email)
            val passwordValidation = ValidationUtils.validatePassword(password)

            if (!emailValidation.isValid || !passwordValidation.isValid) {
                incrementFailedAttempts()
                val errors = (emailValidation.errors + passwordValidation.errors).joinToString(", ")
                emit(Result.failure(IllegalArgumentException("Invalid credentials: $errors")))
                return@flow
            }

            // Attempt authentication
            val authResult = authService.login(email, password)
            authResult.collect { result ->
                result.fold(
                    onSuccess = { user ->
                        // Store encrypted credentials and session data
                        securePreferences.putString(PREF_KEY_AUTH_TOKEN, user.id)
                        securePreferences.putString(PREF_KEY_USER_EMAIL, email)
                        initializeSession()
                        resetFailedAttempts()
                        _currentUser.value = user
                        emit(Result.success(user))
                        Log.i(TAG, "User authenticated successfully: ${user.getMaskedEmail()}")
                    },
                    onFailure = { error ->
                        incrementFailedAttempts()
                        emit(Result.failure(error))
                        Log.e(TAG, "Authentication failed for email: ${email.take(3)}***", error)
                    }
                )
            }
        } catch (e: Exception) {
            incrementFailedAttempts()
            emit(Result.failure(e))
            Log.e(TAG, "Authentication error", e)
        }
    }

    /**
     * Performs biometric authentication with enhanced security validation.
     *
     * @param activity FragmentActivity for biometric prompt
     * @return Flow<Result<User>> Biometric authentication result
     */
    fun loginWithBiometric(activity: FragmentActivity): Flow<Result<User>> = flow {
        try {
            // Verify stored credentials exist
            val storedEmail = securePreferences.getString(PREF_KEY_USER_EMAIL, "")
            if (storedEmail.isEmpty()) {
                emit(Result.failure(SecurityException("No stored credentials found for biometric login")))
                return@flow
            }

            // Attempt biometric authentication
            val authResult = authService.loginWithBiometric(activity)
            authResult.collect { result ->
                result.fold(
                    onSuccess = { user ->
                        initializeSession()
                        _currentUser.value = user
                        emit(Result.success(user))
                        Log.i(TAG, "Biometric authentication successful for user: ${user.getMaskedEmail()}")
                    },
                    onFailure = { error ->
                        emit(Result.failure(error))
                        Log.e(TAG, "Biometric authentication failed", error)
                    }
                )
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
            Log.e(TAG, "Biometric authentication error", e)
        }
    }

    /**
     * Performs secure logout with session cleanup and audit logging.
     *
     * @return Flow<Result<Unit>> Logout operation result
     */
    fun logout(): Flow<Result<Unit>> = flow {
        try {
            authService.logout().collect { result ->
                result.fold(
                    onSuccess = {
                        // Clear secure storage with audit
                        securePreferences.putString(PREF_KEY_AUTH_TOKEN, "")
                        securePreferences.putString(PREF_KEY_USER_EMAIL, "")
                        securePreferences.putString(PREF_KEY_SESSION, "")
                        _currentUser.value = null
                        sessionExpiryTime = 0
                        emit(Result.success(Unit))
                        Log.i(TAG, "User logged out successfully")
                    },
                    onFailure = { error ->
                        emit(Result.failure(error))
                        Log.e(TAG, "Logout failed", error)
                    }
                )
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
            Log.e(TAG, "Logout error", e)
        }
    }

    /**
     * Validates current session with security checks.
     *
     * @return Boolean indicating if session is valid
     */
    private fun validateSession(): Boolean {
        return System.currentTimeMillis() < sessionExpiryTime
    }

    /**
     * Initializes secure session with timeout.
     */
    private fun initializeSession() {
        sessionExpiryTime = System.currentTimeMillis() + 
            TimeUnit.MINUTES.toMillis(SESSION_TIMEOUT_MINUTES.toLong())
        securePreferences.putString(PREF_KEY_SESSION, sessionExpiryTime.toString())
    }

    /**
     * Checks if account is locked due to failed attempts.
     */
    private fun isLockedOut(): Boolean {
        if (failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
            val lockoutEndTime = lastFailedLoginTime + 
                TimeUnit.MINUTES.toMillis(SECURITY.LOCKOUT_DURATION_MINUTES.toLong())
            return System.currentTimeMillis() < lockoutEndTime
        }
        return false
    }

    private fun calculateRemainingLockoutTime(): Long {
        val lockoutEndTime = lastFailedLoginTime + 
            TimeUnit.MINUTES.toMillis(SECURITY.LOCKOUT_DURATION_MINUTES.toLong())
        return TimeUnit.MILLISECONDS.toMinutes(lockoutEndTime - System.currentTimeMillis())
    }

    private fun incrementFailedAttempts() {
        failedLoginAttempts++
        lastFailedLoginTime = System.currentTimeMillis()
    }

    private fun resetFailedAttempts() {
        failedLoginAttempts = 0
        lastFailedLoginTime = 0
    }
}
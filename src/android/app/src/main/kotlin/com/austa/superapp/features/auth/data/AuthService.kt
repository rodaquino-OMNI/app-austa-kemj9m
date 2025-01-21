package com.austa.superapp.features.auth.data

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.austa.superapp.core.constants.AppConstants.SECURITY
import com.austa.superapp.core.network.ApiClient
import com.austa.superapp.core.network.ApiEndpoints
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.core.utils.ValidationUtils
import com.austa.superapp.features.auth.domain.models.User
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * HIPAA-compliant authentication service managing user authentication, session monitoring,
 * and secure credential storage for the AUSTA SuperApp.
 */
@Singleton
class AuthService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiClient: ApiClient,
    private val encryptionManager: EncryptionManager
) {
    private val biometricManager = BiometricManager.from(context)
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .setUserAuthenticationRequired(true)
        .setUserAuthenticationParameters(
            SECURITY.BIOMETRIC_TIMEOUT_SECONDS,
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        )
        .build()

    private val secureStorage = EncryptedSharedPreferences.create(
        context,
        SECURITY.SHARED_PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser

    private val _authState = MutableStateFlow(AuthState.UNAUTHENTICATED)
    val authState: StateFlow<AuthState> = _authState

    private var sessionExpiryTime: Long = 0
    private var failedLoginAttempts = 0
    private var lastFailedLoginTime: Long = 0

    /**
     * Authenticates user with email and password using HIPAA-compliant security measures.
     */
    fun login(email: String, password: String): Flow<Result<User>> = flow {
        try {
            // Check login attempts and lockout
            if (isLockedOut()) {
                emit(Result.failure(SecurityException("Account locked. Please try again later.")))
                return@flow
            }

            // Validate credentials
            val emailValidation = ValidationUtils.validateEmail(email)
            val passwordValidation = ValidationUtils.validatePassword(password)

            if (!emailValidation.isValid || !passwordValidation.isValid) {
                incrementFailedAttempts()
                emit(Result.failure(IllegalArgumentException("Invalid credentials format")))
                return@flow
            }

            // Encrypt credentials for transmission
            val encryptedEmail = encryptionManager.encryptData(email.toByteArray(), "login_email")
            val encryptedPassword = encryptionManager.encryptData(password.toByteArray(), "login_password")

            // Make authentication request
            val authResponse = apiClient.createService(AuthApi::class.java)
                .login(LoginRequest(encryptedEmail, encryptedPassword))

            if (authResponse.isSuccessful && authResponse.body() != null) {
                val user = authResponse.body()!!.user
                val token = authResponse.body()!!.token

                // Store encrypted token
                apiClient.setAuthToken(token)
                storeEncryptedCredentials(email, token)
                
                // Initialize session monitoring
                initializeSession()
                resetFailedAttempts()
                
                _currentUser.value = user
                _authState.value = AuthState.AUTHENTICATED
                
                emit(Result.success(user))
            } else {
                incrementFailedAttempts()
                emit(Result.failure(Exception("Authentication failed")))
            }
        } catch (e: Exception) {
            incrementFailedAttempts()
            emit(Result.failure(e))
        }
    }

    /**
     * Performs biometric authentication with HIPAA compliance.
     */
    fun loginWithBiometric(activity: FragmentActivity): Flow<Result<User>> = flow {
        try {
            // Verify biometric capability
            when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
                BiometricManager.BIOMETRIC_SUCCESS -> {
                    val promptInfo = BiometricPrompt.PromptInfo.Builder()
                        .setTitle("AUSTA SuperApp Authentication")
                        .setSubtitle("Verify your identity")
                        .setNegativeButtonText("Cancel")
                        .setConfirmationRequired(true)
                        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                        .build()

                    val biometricPrompt = BiometricPrompt(activity,
                        object : BiometricPrompt.AuthenticationCallback() {
                            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                                super.onAuthenticationSucceeded(result)
                                // Retrieve stored credentials
                                val encryptedCredentials = retrieveEncryptedCredentials()
                                // Perform login with stored credentials
                                encryptedCredentials?.let { credentials ->
                                    val decryptedEmail = String(encryptionManager.decryptData(credentials.first))
                                    val decryptedToken = String(encryptionManager.decryptData(credentials.second))
                                    apiClient.setAuthToken(decryptedToken)
                                    initializeSession()
                                }
                            }
                        })

                    biometricPrompt.authenticate(promptInfo)
                    emit(Result.success(_currentUser.value!!))
                }
                else -> {
                    emit(Result.failure(SecurityException("Biometric authentication not available")))
                }
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    /**
     * Configures multi-factor authentication for enhanced security.
     */
    fun setupMFA(type: MFAType, verificationData: String): Flow<Result<MFASetupResult>> = flow {
        try {
            if (_authState.value != AuthState.AUTHENTICATED) {
                emit(Result.failure(SecurityException("User must be authenticated to setup MFA")))
                return@flow
            }

            val mfaResponse = apiClient.createService(AuthApi::class.java)
                .setupMFA(MFASetupRequest(type, verificationData))

            if (mfaResponse.isSuccessful && mfaResponse.body() != null) {
                val result = mfaResponse.body()!!
                storeMFACredentials(type, result.secret)
                emit(Result.success(result))
            } else {
                emit(Result.failure(Exception("MFA setup failed")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    /**
     * Securely stores encrypted credentials for biometric login.
     */
    private fun storeEncryptedCredentials(email: String, token: String) {
        val encryptedEmail = encryptionManager.encryptData(email.toByteArray(), "stored_email")
        val encryptedToken = encryptionManager.encryptData(token.toByteArray(), "stored_token")
        
        secureStorage.edit().apply {
            putString("encrypted_email", android.util.Base64.encodeToString(encryptedEmail.encryptedBytes, android.util.Base64.DEFAULT))
            putString("encrypted_token", android.util.Base64.encodeToString(encryptedToken.encryptedBytes, android.util.Base64.DEFAULT))
            apply()
        }
    }

    /**
     * Retrieves stored encrypted credentials.
     */
    private fun retrieveEncryptedCredentials(): Pair<EncryptedData, EncryptedData>? {
        val storedEmail = secureStorage.getString("encrypted_email", null)
        val storedToken = secureStorage.getString("encrypted_token", null)

        return if (storedEmail != null && storedToken != null) {
            val emailBytes = android.util.Base64.decode(storedEmail, android.util.Base64.DEFAULT)
            val tokenBytes = android.util.Base64.decode(storedToken, android.util.Base64.DEFAULT)
            Pair(
                EncryptedData(emailBytes, ByteArray(0), 1, System.currentTimeMillis()),
                EncryptedData(tokenBytes, ByteArray(0), 1, System.currentTimeMillis())
            )
        } else null
    }

    /**
     * Initializes session monitoring with automatic timeout.
     */
    private fun initializeSession() {
        sessionExpiryTime = System.currentTimeMillis() + TimeUnit.MINUTES.toMillis(SECURITY.SESSION_TIMEOUT_MINUTES)
    }

    /**
     * Checks if account is locked due to failed login attempts.
     */
    private fun isLockedOut(): Boolean {
        if (failedLoginAttempts >= SECURITY.MAX_LOGIN_ATTEMPTS) {
            val lockoutEndTime = lastFailedLoginTime + TimeUnit.MINUTES.toMillis(SECURITY.LOCKOUT_DURATION_MINUTES)
            if (System.currentTimeMillis() < lockoutEndTime) {
                return true
            }
            resetFailedAttempts()
        }
        return false
    }

    private fun incrementFailedAttempts() {
        failedLoginAttempts++
        lastFailedLoginTime = System.currentTimeMillis()
    }

    private fun resetFailedAttempts() {
        failedLoginAttempts = 0
        lastFailedLoginTime = 0
    }

    enum class AuthState {
        AUTHENTICATED,
        UNAUTHENTICATED,
        LOCKED
    }

    enum class MFAType {
        SMS,
        EMAIL,
        AUTHENTICATOR
    }

    data class MFASetupResult(
        val secret: String,
        val qrCode: String?
    )
}
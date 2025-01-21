package com.austa.superapp.core.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import java.security.KeyStore
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import javax.crypto.Cipher

/**
 * Manages HIPAA-compliant biometric authentication operations with hardware-backed security.
 * Implements strong biometric authentication for the AUSTA SuperApp with HSM integration.
 * Version: 1.0.0
 */
class BiometricManager(
    private val context: Context,
    private val encryptionManager: EncryptionManager
) {
    companion object {
        private const val TAG = "BiometricManager"
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val BIOMETRIC_KEY_NAME = "com.austa.superapp.BIOMETRIC_KEY"
        private const val MAX_AUTH_ATTEMPTS = 3
        private const val AUTH_TIMEOUT_MS = 30000L
        
        // Required security level for HIPAA compliance
        private const val BIOMETRIC_SECURITY_LEVEL = BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
    }

    private val keyStore: KeyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
        load(null)
    }
    private val authAttempts = AtomicInteger(0)
    private val executor: Executor = Executors.newSingleThreadExecutor()
    private val biometricManager = BiometricManager.from(context)

    /**
     * Represents the result of biometric capability check
     */
    sealed class BiometricCapabilityResult {
        object Available : BiometricCapabilityResult()
        object HardwareUnavailable : BiometricCapabilityResult()
        object NoBiometricEnrolled : BiometricCapabilityResult()
        object SecurityLevelInsufficient : BiometricCapabilityResult()
        object HardwareBackedKeysUnavailable : BiometricCapabilityResult()
    }

    /**
     * Checks if the device supports required biometric capabilities and hardware security
     */
    fun checkBiometricCapability(): BiometricCapabilityResult {
        return when (biometricManager.canAuthenticate(BIOMETRIC_SECURITY_LEVEL)) {
            BiometricManager.BIOMETRIC_SUCCESS -> {
                if (verifyHardwareBackedKeySupport()) {
                    BiometricCapabilityResult.Available
                } else {
                    BiometricCapabilityResult.HardwareBackedKeysUnavailable
                }
            }
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> {
                Log.e(TAG, "No biometric hardware available")
                BiometricCapabilityResult.HardwareUnavailable
            }
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> {
                Log.e(TAG, "No biometric credentials enrolled")
                BiometricCapabilityResult.NoBiometricEnrolled
            }
            else -> {
                Log.e(TAG, "Insufficient security level for HIPAA compliance")
                BiometricCapabilityResult.SecurityLevelInsufficient
            }
        }
    }

    /**
     * Initiates biometric authentication with hardware security verification
     */
    fun authenticateUser(
        activity: FragmentActivity,
        title: String,
        subtitle: String,
        callback: AuthenticationCallback
    ): Flow<AuthenticationResult> {
        val authenticationState = MutableStateFlow<AuthenticationResult>(AuthenticationResult.Idle)

        if (authAttempts.get() >= MAX_AUTH_ATTEMPTS) {
            Log.w(TAG, "Maximum authentication attempts exceeded")
            authenticationState.value = AuthenticationResult.MaxAttemptsExceeded
            return authenticationState
        }

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(BIOMETRIC_SECURITY_LEVEL)
            .setNegativeButtonText("Cancel")
            .setConfirmationRequired(true)
            .setTimeout(AUTH_TIMEOUT_MS)
            .build()

        val biometricPrompt = BiometricPrompt(activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    authAttempts.set(0)
                    Log.i(TAG, "Biometric authentication succeeded")
                    authenticationState.value = AuthenticationResult.Success(result.cryptoObject)
                    callback.onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    Log.e(TAG, "Authentication error [$errorCode]: $errString")
                    authenticationState.value = AuthenticationResult.Error(errorCode, errString.toString())
                    callback.onError(errorCode, errString.toString())
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    authAttempts.incrementAndGet()
                    Log.w(TAG, "Authentication failed. Attempts: ${authAttempts.get()}")
                    authenticationState.value = AuthenticationResult.Failed
                    callback.onFailure()
                }
            })

        try {
            val cipher = getCipher()
            val cryptoObject = BiometricPrompt.CryptoObject(cipher)
            biometricPrompt.authenticate(promptInfo, cryptoObject)
        } catch (e: Exception) {
            Log.e(TAG, "Error preparing authentication: ${e.message}")
            authenticationState.value = AuthenticationResult.Error(
                BiometricPrompt.ERROR_VENDOR,
                "Failed to initialize authentication"
            )
        }

        return authenticationState
    }

    /**
     * Encrypts sensitive data using biometric-protected hardware-backed keys
     */
    suspend fun encryptWithBiometric(data: ByteArray, keyAlias: String): EncryptedData {
        require(data.isNotEmpty()) { "Data to encrypt cannot be empty" }
        
        return try {
            encryptionManager.encryptData(data, "$BIOMETRIC_KEY_NAME.$keyAlias")
        } catch (e: Exception) {
            Log.e(TAG, "Biometric encryption failed: ${e.message}")
            throw SecurityException("Biometric encryption failed", e)
        }
    }

    /**
     * Decrypts data using biometric-protected hardware-backed keys
     */
    suspend fun decryptWithBiometric(encryptedData: EncryptedData, keyAlias: String): ByteArray {
        return try {
            encryptionManager.decryptData(encryptedData)
        } catch (e: Exception) {
            Log.e(TAG, "Biometric decryption failed: ${e.message}")
            throw SecurityException("Biometric decryption failed", e)
        }
    }

    private fun verifyHardwareBackedKeySupport(): Boolean {
        return try {
            val keyGenParameterSpec = KeyGenParameterSpec.Builder(
                BIOMETRIC_KEY_NAME,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(AUTH_TIMEOUT_MS, KeyProperties.AUTH_BIOMETRIC_STRONG)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()

            keyGenParameterSpec.isStrongBoxBacked
        } catch (e: Exception) {
            Log.e(TAG, "Error verifying hardware-backed keys: ${e.message}")
            false
        }
    }

    private fun getCipher(): Cipher {
        return Cipher.getInstance(KeyProperties.KEY_ALGORITHM_AES + "/"
                + KeyProperties.BLOCK_MODE_GCM + "/"
                + KeyProperties.ENCRYPTION_PADDING_NONE)
    }

    sealed class AuthenticationResult {
        object Idle : AuthenticationResult()
        data class Success(val cryptoObject: BiometricPrompt.CryptoObject?) : AuthenticationResult()
        data class Error(val code: Int, val message: String) : AuthenticationResult()
        object Failed : AuthenticationResult()
        object MaxAttemptsExceeded : AuthenticationResult()
    }

    interface AuthenticationCallback {
        fun onSuccess()
        fun onError(errorCode: Int, errorMessage: String)
        fun onFailure()
    }
}
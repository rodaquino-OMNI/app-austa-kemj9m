package com.austa.superapp

import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.view.WindowCompat
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.austa.superapp.core.security.BiometricManager
import com.austa.superapp.core.security.BiometricManager.AuthenticationCallback
import com.austa.superapp.core.security.BiometricManager.BiometricCapabilityResult
import com.security.logging.SecurityLogger
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * HIPAA-compliant main activity class that serves as the secure entry point for the AUSTA SuperApp.
 * Implements biometric authentication, secure navigation, and comprehensive security monitoring.
 *
 * Security Level: HIGH
 * Compliance: HIPAA, LGPD
 * Version: 1.0.0
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val MAX_AUTH_ATTEMPTS = 3
        private const val SECURE_WINDOW_FLAGS = WindowManager.LayoutParams.FLAG_SECURE
    }

    @Inject
    lateinit var biometricManager: BiometricManager

    @Inject
    lateinit var securityLogger: SecurityLogger

    @Inject
    lateinit var application: AUSTAApplication

    private lateinit var navController: NavHostController
    private var authAttempts = 0
    private var isSecureWindowEnabled by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        initializeSecureEnvironment()
        setupSecureBiometricAuth()
        
        setContent {
            MaterialTheme {
                Surface {
                    SecureAppContent()
                }
            }
        }
    }

    private fun initializeSecureEnvironment() {
        try {
            // Enable secure window flags
            window.addFlags(SECURE_WINDOW_FLAGS)
            WindowCompat.setDecorFitsSystemWindows(window, false)
            isSecureWindowEnabled = true

            // Initialize security monitoring
            application.networkMonitor.startMonitoring()
            securityLogger.initialize(TAG)

            Log.i(TAG, "Secure environment initialized")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize secure environment", e)
            securityLogger.logSecurityEvent("INIT_FAILED", e.message ?: "Unknown error")
            finish()
        }
    }

    private fun setupSecureBiometricAuth() {
        when (val result = biometricManager.checkBiometricCapability()) {
            is BiometricCapabilityResult.Available -> {
                authenticateUser()
            }
            is BiometricCapabilityResult.HardwareUnavailable -> {
                Log.e(TAG, "Biometric hardware unavailable")
                securityLogger.logSecurityEvent("BIOMETRIC_UNAVAILABLE", "Hardware not present")
                handleAuthenticationFailure()
            }
            is BiometricCapabilityResult.NoBiometricEnrolled -> {
                Log.e(TAG, "No biometric credentials enrolled")
                securityLogger.logSecurityEvent("NO_BIOMETRICS", "No enrolled credentials")
                handleAuthenticationFailure()
            }
            is BiometricCapabilityResult.SecurityLevelInsufficient -> {
                Log.e(TAG, "Insufficient security level for HIPAA compliance")
                securityLogger.logSecurityEvent("SECURITY_INSUFFICIENT", "Below HIPAA requirements")
                handleAuthenticationFailure()
            }
            is BiometricCapabilityResult.HardwareBackedKeysUnavailable -> {
                Log.e(TAG, "Hardware-backed keys unavailable")
                securityLogger.logSecurityEvent("HSM_UNAVAILABLE", "No hardware security module")
                handleAuthenticationFailure()
            }
        }
    }

    private fun authenticateUser() {
        if (authAttempts >= MAX_AUTH_ATTEMPTS) {
            Log.e(TAG, "Maximum authentication attempts exceeded")
            securityLogger.logSecurityEvent("MAX_AUTH_ATTEMPTS", "Authentication locked")
            handleAuthenticationFailure()
            return
        }

        biometricManager.authenticateUser(
            activity = this,
            title = "Authenticate to AUSTA SuperApp",
            subtitle = "Verify your identity to access secure health data",
            callback = object : AuthenticationCallback {
                override fun onSuccess() {
                    Log.i(TAG, "Biometric authentication successful")
                    securityLogger.logSecurityEvent("AUTH_SUCCESS", "Biometric verification passed")
                    authAttempts = 0
                    setupSecureNavigation()
                }

                override fun onError(errorCode: Int, errorMessage: String) {
                    Log.e(TAG, "Biometric authentication error: $errorMessage")
                    securityLogger.logSecurityEvent("AUTH_ERROR", "Code: $errorCode, $errorMessage")
                    handleAuthenticationFailure()
                }

                override fun onFailure() {
                    authAttempts++
                    Log.w(TAG, "Biometric authentication failed. Attempts: $authAttempts")
                    securityLogger.logSecurityEvent("AUTH_FAILURE", "Attempt: $authAttempts")
                    if (authAttempts >= MAX_AUTH_ATTEMPTS) {
                        handleAuthenticationFailure()
                    }
                }
            }
        )
    }

    @Composable
    private fun SecureAppContent() {
        navController = rememberNavController()

        DisposableEffect(Unit) {
            onDispose {
                application.networkMonitor.stopMonitoring()
            }
        }

        NavHost(
            navController = navController,
            startDestination = "dashboard"
        ) {
            composable("dashboard") {
                // Dashboard screen implementation
            }
            composable("appointments") {
                // Appointments screen implementation
            }
            composable("health_records") {
                // Health records screen implementation
            }
            composable("insurance") {
                // Insurance screen implementation
            }
        }
    }

    private fun setupSecureNavigation() {
        navController.addOnDestinationChangedListener { _, destination, _ ->
            // Log navigation events
            securityLogger.logSecurityEvent(
                "NAVIGATION",
                "Navigated to: ${destination.route}"
            )

            // Verify security state on each navigation
            if (!isSecureWindowEnabled) {
                Log.e(TAG, "Security compromise detected")
                securityLogger.logSecurityEvent("SECURITY_COMPROMISE", "Window security disabled")
                handleSecurityBreach()
            }
        }
    }

    private fun handleAuthenticationFailure() {
        securityLogger.logSecurityEvent("AUTH_BLOCKED", "Authentication failed permanently")
        // Implement secure fallback authentication or app termination
        finish()
    }

    private fun handleSecurityBreach() {
        securityLogger.logSecurityEvent("SECURITY_BREACH", "Critical security violation")
        application.securityManager.secureAppData()
        finish()
    }

    override fun onPause() {
        super.onPause()
        // Secure app data when backgrounded
        application.securityManager.secureAppData()
    }

    override fun onDestroy() {
        super.onDestroy()
        // Cleanup security resources
        application.networkMonitor.stopMonitoring()
        securityLogger.logSecurityEvent("APP_TERMINATED", "Clean shutdown")
    }
}
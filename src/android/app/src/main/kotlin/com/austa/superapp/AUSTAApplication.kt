package com.austa.superapp

import android.app.Application
import android.util.Log
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleObserver
import androidx.lifecycle.OnLifecycleEvent
import androidx.lifecycle.ProcessLifecycleOwner
import com.austa.security.SecurityManager
import com.austa.superapp.core.di.AppModule
import com.austa.superapp.core.network.NetworkMonitor
import com.austa.superapp.core.storage.SecurePreferences
import com.google.firebase.crashlytics.FirebaseCrashlytics
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Main application class for AUSTA SuperApp implementing HIPAA-compliant initialization,
 * comprehensive monitoring, and secure service management.
 *
 * Security Level: HIGH
 * Compliance: HIPAA, LGPD
 * Version: 1.0.0
 */
@HiltAndroidApp
class AUSTAApplication : Application(), LifecycleObserver {

    companion object {
        private const val TAG = "AUSTAApplication"
        private const val SECURITY_VERSION = "1.0.0"
    }

    @Inject
    lateinit var networkMonitor: NetworkMonitor

    @Inject
    lateinit var securityManager: SecurityManager

    @Inject
    lateinit var securePreferences: SecurePreferences

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var crashlytics: FirebaseCrashlytics

    override fun onCreate() {
        super.onCreate()
        initializeApplication()
    }

    private fun initializeApplication() {
        try {
            // Initialize security components first
            initializeSecurity()

            // Setup lifecycle monitoring
            ProcessLifecycleOwner.get().lifecycle.addObserver(this)

            // Initialize crash reporting
            initializeCrashReporting()

            // Start network monitoring
            startNetworkMonitoring()

            // Initialize performance tracking
            initializePerformanceTracking()

            Log.i(TAG, "Application initialized successfully")

        } catch (e: Exception) {
            Log.e(TAG, "Application initialization failed", e)
            crashlytics.recordException(e)
            throw RuntimeException("Critical initialization failure", e)
        }
    }

    private fun initializeSecurity() {
        try {
            // Verify security prerequisites
            securityManager.verifySecurityRequirements()

            // Initialize secure storage
            securePreferences.verifyEncryptionKey()

            // Configure security policies
            securityManager.apply {
                enableHIPAACompliance()
                setSecurityLevel(SecurityManager.Level.HIGH)
                enforceDataEncryption(true)
                setSessionTimeout(AppConstants.SECURITY.SESSION_TIMEOUT_MINUTES)
            }

            Log.i(TAG, "Security components initialized successfully")

        } catch (e: Exception) {
            Log.e(TAG, "Security initialization failed", e)
            throw SecurityException("Failed to initialize security components", e)
        }
    }

    private fun initializeCrashReporting() {
        crashlytics = FirebaseCrashlytics.getInstance().apply {
            setCrashlyticsCollectionEnabled(true)
            setCustomKey("security_version", SECURITY_VERSION)
            setCustomKey("app_version", BuildConfig.VERSION_NAME)
        }
    }

    private fun startNetworkMonitoring() {
        applicationScope.launch {
            try {
                networkMonitor.startMonitoring()
                Log.i(TAG, "Network monitoring started")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start network monitoring", e)
                crashlytics.recordException(e)
            }
        }
    }

    private fun initializePerformanceTracking() {
        applicationScope.launch {
            try {
                // Initialize performance monitoring
                com.google.firebase.perf.FirebasePerformance.getInstance().apply {
                    isPerformanceCollectionEnabled = true
                }

                // Setup custom trace monitoring
                setupCustomTraces()

                Log.i(TAG, "Performance tracking initialized")

            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize performance tracking", e)
                crashlytics.recordException(e)
            }
        }
    }

    private fun setupCustomTraces() {
        // Setup custom performance traces for critical paths
        applicationScope.launch {
            try {
                // Monitor app startup time
                addCustomTrace("app_cold_start")
                
                // Monitor network operations
                addCustomTrace("network_operations")
                
                // Monitor encryption operations
                addCustomTrace("encryption_operations")
                
                Log.i(TAG, "Custom traces configured successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to setup custom traces", e)
                crashlytics.recordException(e)
            }
        }
    }

    @OnLifecycleEvent(Lifecycle.Event.ON_STOP)
    fun onAppBackgrounded() {
        applicationScope.launch {
            try {
                // Secure sensitive data
                securityManager.secureAppData()
                
                // Update session state
                securePreferences.putString("last_background_time", 
                    System.currentTimeMillis().toString())
                
                Log.i(TAG, "Application backgrounded successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Error handling app background", e)
                crashlytics.recordException(e)
            }
        }
    }

    @OnLifecycleEvent(Lifecycle.Event.ON_START)
    fun onAppForegrounded() {
        applicationScope.launch {
            try {
                // Verify security state
                securityManager.verifySecurityState()
                
                // Check session validity
                checkAndRefreshSession()
                
                Log.i(TAG, "Application foregrounded successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Error handling app foreground", e)
                crashlytics.recordException(e)
            }
        }
    }

    private fun checkAndRefreshSession() {
        try {
            val lastBackgroundTime = securePreferences.getString("last_background_time", "0").toLong()
            val sessionTimeout = AppConstants.SECURITY.SESSION_TIMEOUT_MINUTES * 60 * 1000L
            
            if (System.currentTimeMillis() - lastBackgroundTime > sessionTimeout) {
                securityManager.invalidateSession()
                // Trigger re-authentication
            }
        } catch (e: Exception) {
            Log.e(TAG, "Session check failed", e)
            crashlytics.recordException(e)
        }
    }

    override fun onTerminate() {
        try {
            // Stop network monitoring
            networkMonitor.stopMonitoring()
            
            // Cleanup security resources
            securityManager.cleanup()
            
            // Cancel all coroutines
            applicationScope.cancel()
            
            super.onTerminate()
            
            Log.i(TAG, "Application terminated successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error during application termination", e)
            crashlytics.recordException(e)
        }
    }

    private fun addCustomTrace(traceName: String) {
        com.google.firebase.perf.metrics.AddTrace(traceName)
    }
}
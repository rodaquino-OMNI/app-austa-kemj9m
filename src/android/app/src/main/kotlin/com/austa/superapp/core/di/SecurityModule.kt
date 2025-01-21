package com.austa.superapp.core.di

import android.content.Context
import com.austa.superapp.core.security.BiometricManager
import com.austa.superapp.core.security.EncryptionManager
import com.austa.superapp.core.storage.SecurePreferences
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Dagger Hilt module providing HIPAA-compliant security dependencies with hardware-backed encryption,
 * biometric authentication, and secure storage capabilities.
 *
 * All components are provided as thread-safe singletons with proper initialization verification
 * and hardware security module integration.
 *
 * Version: 1.0.0
 * Security Level: HIGH
 * Compliance: HIPAA
 */
@Module
@InstallIn(SingletonComponent::class)
object SecurityModule {

    /**
     * Provides a singleton instance of EncryptionManager with hardware-backed key protection
     * and HIPAA-compliant encryption parameters.
     *
     * @param context Application context for hardware security access
     * @return Thread-safe EncryptionManager instance
     * @throws SecurityException if hardware security requirements cannot be met
     */
    @Provides
    @Singleton
    fun provideEncryptionManager(
        context: Context
    ): EncryptionManager {
        return EncryptionManager().apply {
            // Verify hardware security module availability
            try {
                verifyHardwareSecurity()
            } catch (e: Exception) {
                throw SecurityException("Hardware security requirements not met", e)
            }
        }
    }

    /**
     * Provides a singleton instance of BiometricManager with hardware-backed security
     * and fallback authentication mechanisms.
     *
     * @param context Application context for biometric services
     * @param encryptionManager EncryptionManager for securing biometric keys
     * @return Thread-safe BiometricManager instance
     */
    @Provides
    @Singleton
    fun provideBiometricManager(
        context: Context,
        encryptionManager: EncryptionManager
    ): BiometricManager {
        return BiometricManager(
            context = context,
            encryptionManager = encryptionManager
        )
    }

    /**
     * Provides a singleton instance of SecurePreferences with encrypted storage
     * and automatic key rotation capabilities.
     *
     * @param context Application context for SharedPreferences access
     * @param encryptionManager EncryptionManager for data encryption
     * @return Thread-safe SecurePreferences instance
     * @throws SecurityException if secure storage initialization fails
     */
    @Provides
    @Singleton
    fun provideSecurePreferences(
        context: Context,
        encryptionManager: EncryptionManager
    ): SecurePreferences {
        return SecurePreferences(context).apply {
            try {
                // Initialize secure storage with encryption verification
                initializeSecureStorage()
            } catch (e: Exception) {
                throw SecurityException("Secure storage initialization failed", e)
            }
        }
    }
}
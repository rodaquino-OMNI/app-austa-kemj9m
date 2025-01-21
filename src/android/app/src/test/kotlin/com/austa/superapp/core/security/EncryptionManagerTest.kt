package com.austa.superapp.core.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestCoroutineScope
import kotlinx.coroutines.test.runBlockingTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.MockitoAnnotations
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.crypto.SecretKey
import kotlin.random.Random

@ExperimentalCoroutinesApi
class EncryptionManagerTest {

    companion object {
        private const val TEST_KEY_ALIAS = "test_encryption_key_alias"
        private val TEST_DATA = "test_sensitive_phi_data".toByteArray()
        private val LARGE_TEST_DATA = ByteArray(1024 * 1024) { Random.nextBytes(1)[0] }
        private val TEST_IV = ByteArray(12) { 0 }
    }

    private lateinit var encryptionManager: EncryptionManager
    
    @Mock
    private lateinit var mockKeyStore: KeyStore
    
    @Mock
    private lateinit var mockSecretKey: SecretKey
    
    @Mock
    private lateinit var mockKeyInfo: KeyInfo

    private lateinit var testScope: TestCoroutineScope

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        testScope = TestCoroutineScope()

        // Configure mock KeyStore
        `when`(mockKeyStore.getKey(any(), isNull())).thenReturn(mockSecretKey)
        `when`(mockSecretKey as? KeyInfo).thenReturn(mockKeyInfo)
        `when`(mockKeyInfo.isInsideSecureHardware).thenReturn(true)

        encryptionManager = EncryptionManager()
    }

    @Test
    fun testKeyGeneration() {
        // Test hardware-backed key generation
        val encryptedData = encryptionManager.encryptData(TEST_DATA, TEST_KEY_ALIAS)
        
        assertNotNull("Generated key should not be null", encryptedData)
        assertEquals("Key version should be 1 for first key", 1, encryptedData.keyVersion)
        assertTrue("IV should not be empty", encryptedData.iv.isNotEmpty())
        assertEquals("IV length should be 12 bytes", 12, encryptedData.iv.size)
    }

    @Test
    fun testEncryptionDecryption() {
        // Test encryption
        val encryptedData = encryptionManager.encryptData(TEST_DATA, TEST_KEY_ALIAS)
        assertNotNull("Encrypted data should not be null", encryptedData)
        assertNotEquals("Encrypted data should differ from original", 
            TEST_DATA.contentToString(), 
            encryptedData.encryptedBytes.contentToString()
        )

        // Test decryption
        val decryptedData = encryptionManager.decryptData(encryptedData)
        assertArrayEquals("Decrypted data should match original", TEST_DATA, decryptedData)
    }

    @Test
    fun testLargeDataEncryption() {
        // Test encryption of large data blocks
        val encryptedData = encryptionManager.encryptData(LARGE_TEST_DATA, TEST_KEY_ALIAS)
        assertNotNull("Large data encryption should succeed", encryptedData)
        
        val decryptedData = encryptionManager.decryptData(encryptedData)
        assertArrayEquals("Large data should decrypt correctly", LARGE_TEST_DATA, decryptedData)
    }

    @Test
    fun testKeyRotation() {
        // Initial encryption with original key
        val originalEncrypted = encryptionManager.encryptData(TEST_DATA, TEST_KEY_ALIAS)
        
        // Perform key rotation
        assertTrue("Key rotation should succeed", encryptionManager.rotateKey(TEST_KEY_ALIAS))
        
        // Encrypt with new key
        val newEncrypted = encryptionManager.encryptData(TEST_DATA, TEST_KEY_ALIAS)
        
        assertNotEquals("Key versions should differ after rotation",
            originalEncrypted.keyVersion,
            newEncrypted.keyVersion
        )
        
        // Verify both old and new data can be decrypted
        val originalDecrypted = encryptionManager.decryptData(originalEncrypted)
        val newDecrypted = encryptionManager.decryptData(newEncrypted)
        
        assertArrayEquals("Original data should still decrypt", TEST_DATA, originalDecrypted)
        assertArrayEquals("New data should decrypt", TEST_DATA, newDecrypted)
    }

    @Test
    fun testThreadSafety() {
        val threadCount = 10
        val latch = CountDownLatch(threadCount)
        val exceptions = mutableListOf<Exception>()
        
        // Launch multiple threads performing encryption
        repeat(threadCount) {
            Thread {
                try {
                    val data = "thread_$it".toByteArray()
                    val encrypted = encryptionManager.encryptData(data, TEST_KEY_ALIAS)
                    val decrypted = encryptionManager.decryptData(encrypted)
                    assertArrayEquals("Thread-safe encryption/decryption failed", data, decrypted)
                } catch (e: Exception) {
                    synchronized(exceptions) {
                        exceptions.add(e)
                    }
                } finally {
                    latch.countDown()
                }
            }.start()
        }
        
        assertTrue("Concurrent operations timed out",
            latch.await(30, TimeUnit.SECONDS)
        )
        assertTrue("Thread-safety violations detected: ${exceptions.firstOrNull()?.message}",
            exceptions.isEmpty()
        )
    }

    @Test(expected = SecurityException::class)
    fun testEmptyDataEncryption() {
        encryptionManager.encryptData(ByteArray(0), TEST_KEY_ALIAS)
    }

    @Test(expected = SecurityException::class)
    fun testInvalidKeyDecryption() {
        val encryptedData = EncryptedData(
            encryptedBytes = TEST_DATA,
            iv = TEST_IV,
            keyVersion = 999, // Non-existent key version
            timestamp = System.currentTimeMillis()
        )
        encryptionManager.decryptData(encryptedData)
    }

    @Test
    fun testEncryptionPerformance() {
        val startTime = System.nanoTime()
        val encryptedData = encryptionManager.encryptData(LARGE_TEST_DATA, TEST_KEY_ALIAS)
        val encryptionTime = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startTime)
        
        assertTrue("Encryption of large data should complete within reasonable time",
            encryptionTime < 1000 // 1 second max
        )
        assertNotNull("Encrypted data should be produced", encryptedData)
    }

    @Test
    fun testKeyVersionIncrement() {
        val firstEncrypted = encryptionManager.encryptData(TEST_DATA, TEST_KEY_ALIAS)
        encryptionManager.rotateKey(TEST_KEY_ALIAS)
        val secondEncrypted = encryptionManager.encryptData(TEST_DATA, TEST_KEY_ALIAS)
        
        assertEquals("Initial key version should be 1", 1, firstEncrypted.keyVersion)
        assertEquals("Key version should increment after rotation", 2, secondEncrypted.keyVersion)
    }
}
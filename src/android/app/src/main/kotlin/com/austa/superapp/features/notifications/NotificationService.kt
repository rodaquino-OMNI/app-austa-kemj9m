package com.austa.superapp.features.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.*
import com.austa.superapp.core.constants.AppConstants.NOTIFICATIONS
import com.austa.superapp.core.network.ApiClient
import com.austa.superapp.core.security.EncryptionManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import java.util.*
import java.util.concurrent.PriorityBlockingQueue
import javax.inject.Inject

/**
 * Enhanced HIPAA-compliant notification service for healthcare-related notifications.
 * Implements secure message handling, prioritization, and delivery tracking.
 * Version: 1.0.0
 */
@AndroidEntryPoint
class NotificationService : FirebaseMessagingService() {

    @Inject
    lateinit var encryptionManager: EncryptionManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val apiClient by lazy { ApiClient.getInstance(applicationContext) }
    private val notificationManager by lazy { getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager }
    private val notificationQueue = PriorityBlockingQueue<NotificationData>(
        NOTIFICATIONS.MAX_NOTIFICATIONS,
        compareBy { it.priority.value }
    )
    private val deliveryTracker = MutableStateFlow<Map<String, DeliveryStatus>>(emptyMap())

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        initializeDeliveryTracking()
    }

    /**
     * Handles new FCM token with encryption and secure backend registration
     */
    override fun onNewToken(token: String) {
        scope.launch(Dispatchers.IO + CoroutineExceptionHandler { _, e ->
            logSecurityEvent("FCM token update failed", e)
        }) {
            try {
                val encryptedToken = encryptionManager.encryptData(token.toByteArray(), "fcm_token")
                apiClient.createService(NotificationApi::class.java)
                    .updateFcmToken(encryptedToken)
                logSecurityEvent("FCM token updated successfully")
            } catch (e: Exception) {
                logSecurityEvent("Failed to update FCM token", e)
            }
        }
    }

    /**
     * Processes incoming FCM messages with HIPAA compliance and security measures
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        scope.launch(Dispatchers.IO + CoroutineExceptionHandler { _, e ->
            logSecurityEvent("Message processing failed", e)
        }) {
            try {
                val notificationData = processRemoteMessage(remoteMessage)
                if (validateNotificationData(notificationData)) {
                    notificationQueue.offer(notificationData)
                    processNotificationQueue()
                }
            } catch (e: Exception) {
                logSecurityEvent("Failed to process remote message", e)
            }
        }
    }

    private fun processRemoteMessage(remoteMessage: RemoteMessage): NotificationData {
        val encryptedData = remoteMessage.data["encrypted_payload"]
            ?: throw SecurityException("Missing encrypted payload")

        val decryptedData = encryptionManager.decryptData(
            EncryptedData(
                Base64.decode(encryptedData, Base64.DEFAULT),
                remoteMessage.data["iv"]?.let { Base64.decode(it, Base64.DEFAULT) }
                    ?: throw SecurityException("Missing IV"),
                remoteMessage.data["key_version"]?.toInt()
                    ?: throw SecurityException("Missing key version"),
                remoteMessage.data["timestamp"]?.toLong()
                    ?: System.currentTimeMillis()
            )
        )

        return NotificationData(
            id = UUID.randomUUID().toString(),
            title = remoteMessage.notification?.title ?: "",
            message = remoteMessage.notification?.body ?: "",
            type = NotificationType.valueOf(remoteMessage.data["type"] ?: "GENERAL"),
            priority = NotificationPriority.valueOf(remoteMessage.data["priority"] ?: "NORMAL"),
            encryptedData = remoteMessage.data,
            deliveryConfirmationRequired = remoteMessage.data["require_confirmation"]?.toBoolean() ?: false,
            hipaaCompliant = true,
            retryCount = 0,
            timestamp = System.currentTimeMillis()
        )
    }

    private fun validateNotificationData(data: NotificationData): Boolean {
        return data.title.isNotEmpty() &&
                data.message.isNotEmpty() &&
                data.timestamp >= System.currentTimeMillis() - TimeUnit.HOURS.toMillis(24)
    }

    private fun processNotificationQueue() {
        while (notificationQueue.isNotEmpty()) {
            val notification = notificationQueue.poll() ?: break
            showNotification(notification)
            if (notification.deliveryConfirmationRequired) {
                sendDeliveryConfirmation(notification)
            }
        }
    }

    private fun showNotification(data: NotificationData) {
        val builder = NotificationCompat.Builder(this, NOTIFICATIONS.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(data.title)
            .setContentText(data.message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setVibrate(NOTIFICATIONS.VIBRATION_PATTERN)
            .setLights(Color.parseColor(NOTIFICATIONS.LED_COLOR), 1000, 1000)

        if (data.type == NotificationType.EMERGENCY_CARE) {
            builder.setFullScreenIntent(createFullScreenIntent(data), true)
        }

        notificationManager.notify(data.id.hashCode(), builder.build())
        updateDeliveryStatus(data.id, DeliveryStatus.DELIVERED)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATIONS.CHANNEL_ID,
                NOTIFICATIONS.CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = NOTIFICATIONS.CHANNEL_DESCRIPTION
                enableLights(true)
                lightColor = Color.parseColor(NOTIFICATIONS.LED_COLOR)
                enableVibration(true)
                vibrationPattern = NOTIFICATIONS.VIBRATION_PATTERN
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createFullScreenIntent(data: NotificationData): PendingIntent {
        val intent = Intent(this, EmergencyCareActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("notification_id", data.id)
        }
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    private fun sendDeliveryConfirmation(data: NotificationData) {
        scope.launch(Dispatchers.IO) {
            try {
                apiClient.createService(NotificationApi::class.java)
                    .confirmDelivery(data.id)
                updateDeliveryStatus(data.id, DeliveryStatus.CONFIRMED)
            } catch (e: Exception) {
                logSecurityEvent("Delivery confirmation failed", e)
                scheduleRetry(data)
            }
        }
    }

    private fun scheduleRetry(data: NotificationData) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val retryWork = OneTimeWorkRequestBuilder<NotificationRetryWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                NOTIFICATIONS.RETRY_INTERVAL_MINUTES.toLong(),
                TimeUnit.MINUTES
            )
            .setInputData(workDataOf("notification_id" to data.id))
            .build()

        WorkManager.getInstance(applicationContext)
            .enqueueUniqueWork(
                "notification_retry_${data.id}",
                ExistingWorkPolicy.REPLACE,
                retryWork
            )
    }

    private fun initializeDeliveryTracking() {
        scope.launch(Dispatchers.IO) {
            while (isActive) {
                val currentDeliveryStatus = deliveryTracker.value
                currentDeliveryStatus.forEach { (id, status) ->
                    if (status == DeliveryStatus.PENDING && 
                        System.currentTimeMillis() - status.timestamp > TimeUnit.MINUTES.toMillis(5)) {
                        scheduleRetry(notificationQueue.find { it.id == id } ?: return@forEach)
                    }
                }
                delay(TimeUnit.MINUTES.toMillis(1))
            }
        }
    }

    private fun updateDeliveryStatus(id: String, status: DeliveryStatus) {
        deliveryTracker.value = deliveryTracker.value.toMutableMap().apply {
            put(id, status)
        }
    }

    private fun logSecurityEvent(message: String, error: Exception? = null) {
        // Implement secure logging
    }

    enum class NotificationPriority(val value: Int) {
        EMERGENCY(0),
        HIGH(1),
        NORMAL(2),
        LOW(3)
    }

    enum class DeliveryStatus(val timestamp: Long = System.currentTimeMillis()) {
        PENDING,
        DELIVERED,
        CONFIRMED,
        FAILED
    }
}
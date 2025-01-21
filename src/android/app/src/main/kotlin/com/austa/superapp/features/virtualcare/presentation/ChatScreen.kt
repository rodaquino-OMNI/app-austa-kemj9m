package com.austa.superapp.features.virtualcare.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.security.crypto.EncryptedSharedPreferences // v1.1.0-alpha06
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.utils.ValidationUtils
import com.austa.superapp.features.virtualcare.domain.models.Consultation
import com.austa.superapp.features.virtualcare.data.VirtualCareRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.Date
import androidx.compose.runtime.Immutable
import androidx.compose.ui.platform.testTag

/**
 * HIPAA-compliant chat message data class with encryption and delivery tracking
 */
@Immutable
data class ChatMessage(
    val id: String,
    val senderId: String,
    val encryptedContent: String,
    val timestamp: Long,
    val status: MessageStatus,
    val encryptionVersion: String = AppConstants.SECURITY.ENCRYPTION_ALGORITHM,
    val isAuditLogged: Boolean = false,
    val deliveryInfo: DeliveryInfo
)

enum class MessageStatus {
    SENDING, SENT, DELIVERED, READ, ERROR, ENCRYPTED, AUDIT_LOGGED
}

data class DeliveryInfo(
    val sentTimestamp: Long,
    val deliveredTimestamp: Long? = null,
    val readTimestamp: Long? = null,
    val retryCount: Int = 0,
    val errorMessage: String? = null
)

/**
 * HIPAA-compliant chat screen composable for virtual care consultations
 * @param navController Navigation controller for screen navigation
 * @param consultationId ID of the active consultation
 */
@Composable
fun ChatScreen(
    navController: NavController,
    consultationId: String
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { VirtualCareRepository() }

    var messages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var inputText by remember { mutableStateOf("") }
    var consultation by remember { mutableStateOf<Consultation?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    // Performance tracking
    var messageLatency by remember { mutableStateOf(0L) }
    val performanceThreshold = AppConstants.PERFORMANCE_THRESHOLD_MS

    // Initialize secure message channel
    LaunchedEffect(consultationId) {
        repository.getActiveConsultation(consultationId)
            .catch { e ->
                error = "Failed to load consultation: ${e.message}"
            }
            .collect { result ->
                consultation = result
                // Setup encrypted message observer
                repository.observeMessages(consultationId)
                    .map { encryptedMessage ->
                        val startTime = System.currentTimeMillis()
                        val decryptedMessage = decryptMessage(encryptedMessage, consultation?.encryptionKey)
                        messageLatency = System.currentTimeMillis() - startTime
                        decryptedMessage
                    }
                    .collect { message ->
                        messages = messages + message
                        // Track performance
                        if (messageLatency > performanceThreshold) {
                            logPerformanceIssue("message_decryption", messageLatency)
                        }
                    }
            }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .testTag("chat_screen")
    ) {
        // Message list
        ChatMessageList(
            encryptedMessages = messages,
            currentUserId = consultation?.patientId ?: "",
            encryptionKey = consultation?.encryptionKey ?: "",
            modifier = Modifier.weight(1f)
        )

        // Input area
        ChatInput(
            onSendEncryptedMessage = { message ->
                scope.launch {
                    val startTime = System.currentTimeMillis()
                    try {
                        repository.sendEncryptedMessage(
                            consultationId = consultationId,
                            content = message,
                            encryptionKey = consultation?.encryptionKey ?: ""
                        )
                        val latency = System.currentTimeMillis() - startTime
                        if (latency > performanceThreshold) {
                            logPerformanceIssue("message_sending", latency)
                        }
                    } catch (e: Exception) {
                        error = "Failed to send message: ${e.message}"
                    }
                }
            },
            config = ValidationConfig(
                maxLength = MAX_MESSAGE_LENGTH,
                debounceMs = MESSAGE_DEBOUNCE_MS
            )
        )

        // Error handling
        error?.let { errorMessage ->
            Snackbar(
                modifier = Modifier.padding(16.dp),
                action = {
                    TextButton(onClick = { error = null }) {
                        Text("Dismiss")
                    }
                }
            ) {
                Text(errorMessage)
            }
        }
    }
}

@Composable
private fun ChatMessageList(
    encryptedMessages: List<ChatMessage>,
    currentUserId: String,
    encryptionKey: String,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier
            .fillMaxWidth()
            .testTag("message_list"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(encryptedMessages) { message ->
            val isCurrentUser = message.senderId == currentUserId
            val decryptedContent = decryptMessage(message.encryptedContent, encryptionKey)

            MessageBubble(
                content = decryptedContent,
                timestamp = message.timestamp,
                isCurrentUser = isCurrentUser,
                status = message.status,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun ChatInput(
    onSendEncryptedMessage: (String) -> Unit,
    config: ValidationConfig,
    modifier: Modifier = Modifier
) {
    var text by remember { mutableStateOf("") }
    var isValid by remember { mutableStateOf(true) }

    Column(modifier = modifier.padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextField(
                value = text,
                onValueChange = { newText ->
                    if (newText.length <= config.maxLength) {
                        text = newText
                        isValid = ValidationUtils.validateHealthData(
                            mapOf("message" to newText)
                        ).isValid
                    }
                },
                modifier = Modifier
                    .weight(1f)
                    .testTag("message_input"),
                placeholder = { Text("Type a message") },
                isError = !isValid
            )

            Spacer(modifier = Modifier.width(8.dp))

            Button(
                onClick = {
                    if (isValid && text.isNotBlank()) {
                        onSendEncryptedMessage(text)
                        text = ""
                    }
                },
                enabled = isValid && text.isNotBlank(),
                modifier = Modifier.testTag("send_button")
            ) {
                Text("Send")
            }
        }

        if (!isValid) {
            Text(
                text = "Invalid message content",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}

private fun decryptMessage(encryptedContent: String, encryptionKey: String?): String {
    return try {
        if (encryptionKey == null) throw IllegalStateException("Encryption key not available")
        // Implement actual decryption logic here
        encryptedContent // Placeholder
    } catch (e: Exception) {
        "Unable to decrypt message"
    }
}

private fun logPerformanceIssue(operation: String, latency: Long) {
    // Implement performance logging
}

private data class ValidationConfig(
    val maxLength: Int,
    val debounceMs: Long
)

private const val MAX_MESSAGE_LENGTH = 2000
private const val MESSAGE_DEBOUNCE_MS = 300L
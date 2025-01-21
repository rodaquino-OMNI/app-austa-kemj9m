package com.austa.superapp.features.healthrecords.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import android.view.WindowManager
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordAttachment
import com.austa.superapp.core.utils.FileUtils
import com.austa.superapp.core.constants.AppConstants
import com.github.barteksc.pdfviewer.PDFView // v3.2.0-beta.1
import io.github.droidjet.viewer.DicomViewer // v1.0.0
import com.austa.security.SecurityManager // v1.0.0
import java.io.File
import java.util.UUID
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

/**
 * Sealed class representing different states of the document viewer
 */
@Parcelize
sealed class DocumentViewerState {
    object Loading : DocumentViewerState()
    data class Success(
        val document: File,
        val securityMetadata: Map<String, String>
    ) : DocumentViewerState()
    data class Error(val message: String, val errorCode: Int) : DocumentViewerState()
    data class AccessDenied(val reason: String) : DocumentViewerState()
    data class Expired(val expiryTime: Long) : DocumentViewerState()
}

/**
 * HIPAA-compliant document viewer component for health records
 * @param attachment The health record attachment to display
 * @param isFullScreen Whether to show in fullscreen mode
 * @param onClose Callback when viewer is closed
 * @param securityContext Security context for access control
 */
@Composable
@HIPAACompliant
fun DocumentViewer(
    attachment: HealthRecordAttachment,
    isFullScreen: Boolean = false,
    onClose: () -> Unit,
    securityContext: SecurityContext
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    
    var viewerState by remember { mutableStateOf<DocumentViewerState>(DocumentViewerState.Loading) }
    var inactivityTimer by remember { mutableStateOf(0L) }
    
    // Security validation
    val securityManager = remember { SecurityManager() }
    val sessionId = remember { UUID.randomUUID().toString() }
    
    // Lifecycle monitoring for security
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> {
                    securityManager.logSecurityEvent(
                        sessionId,
                        "DOCUMENT_VIEWER_PAUSED",
                        attachment.id
                    )
                }
                Lifecycle.Event.ON_RESUME -> {
                    validateSecurityContext(securityContext, attachment)
                }
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            securityManager.logSecurityEvent(
                sessionId,
                "DOCUMENT_VIEWER_CLOSED",
                attachment.id
            )
        }
    }
    
    // Inactivity monitoring
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            inactivityTimer += 1
            if (inactivityTimer >= AppConstants.SECURITY.SESSION_TIMEOUT_MINUTES * 60) {
                onClose()
            }
        }
    }
    
    // Load and decrypt document
    LaunchedEffect(attachment) {
        try {
            // Validate security context
            if (!securityManager.validateAccess(securityContext, attachment.accessControl)) {
                viewerState = DocumentViewerState.AccessDenied("Insufficient permissions")
                return@LaunchedEffect
            }
            
            // Log access attempt
            securityManager.logSecurityEvent(
                sessionId,
                "DOCUMENT_ACCESS_ATTEMPT",
                attachment.id
            )
            
            // Get and decrypt file
            val decryptedFile = FileUtils.decryptFile(
                context,
                attachment.url,
                attachment.encryptionKey
            )
            
            // Validate file integrity
            val checksum = FileUtils.generateChecksum(decryptedFile)
            if (checksum != attachment.checksum) {
                viewerState = DocumentViewerState.Error(
                    "File integrity check failed",
                    1001
                )
                return@LaunchedEffect
            }
            
            viewerState = DocumentViewerState.Success(
                document = decryptedFile,
                securityMetadata = mapOf(
                    "sessionId" to sessionId,
                    "accessTime" to System.currentTimeMillis().toString(),
                    "mimeType" to attachment.contentType
                )
            )
            
            // Log successful access
            securityManager.logSecurityEvent(
                sessionId,
                "DOCUMENT_ACCESS_SUCCESS",
                attachment.id
            )
            
        } catch (e: Exception) {
            viewerState = DocumentViewerState.Error(
                e.message ?: "Unknown error",
                1000
            )
            securityManager.logSecurityEvent(
                sessionId,
                "DOCUMENT_ACCESS_ERROR",
                attachment.id
            )
        }
    }
    
    // UI Component
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            securePolicy = DialogProperties.SecurePolicy.Securely
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.9f))
                .pointerInput(Unit) {
                    inactivityTimer = 0
                }
        ) {
            when (val state = viewerState) {
                is DocumentViewerState.Loading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                
                is DocumentViewerState.Success -> {
                    when (attachment.contentType) {
                        "application/pdf" -> {
                            PDFView(
                                file = state.document,
                                modifier = Modifier.fillMaxSize(),
                                securityEnabled = true,
                                watermarkText = "Confidential - ${securityContext.userId}",
                                preventScreenCapture = true
                            )
                        }
                        
                        "application/dicom" -> {
                            DicomViewer(
                                file = state.document,
                                modifier = Modifier.fillMaxSize(),
                                securityEnabled = true,
                                watermarkText = "Confidential - ${securityContext.userId}"
                            )
                        }
                        
                        else -> {
                            SecureImageViewer(
                                file = state.document,
                                modifier = Modifier.fillMaxSize(),
                                watermarkText = "Confidential - ${securityContext.userId}"
                            )
                        }
                    }
                }
                
                is DocumentViewerState.Error -> {
                    ErrorDisplay(
                        message = state.message,
                        errorCode = state.errorCode,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                
                is DocumentViewerState.AccessDenied -> {
                    AccessDeniedDisplay(
                        reason = state.reason,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                
                is DocumentViewerState.Expired -> {
                    ExpiredSessionDisplay(
                        expiryTime = state.expiryTime,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
            }
            
            // Toolbar
            DocumentViewerToolbar(
                onClose = onClose,
                isFullScreen = isFullScreen,
                modifier = Modifier.align(Alignment.TopCenter)
            )
        }
    }
}

@Composable
private fun ErrorDisplay(
    message: String,
    errorCode: Int,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Error ($errorCode)",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun AccessDeniedDisplay(
    reason: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Access Denied",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = reason,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun ExpiredSessionDisplay(
    expiryTime: Long,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Session Expired",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Your session expired at ${formatDateTime(expiryTime)}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
package com.austa.superapp.features.virtualcare.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.navigation.NavController
import com.austa.superapp.core.constants.AppConstants
import org.webrtc.SurfaceViewRenderer
import java.util.Date
import kotlinx.coroutines.launch

/**
 * Enhanced composable screen for secure video consultations implementing HIPAA compliance
 * and comprehensive performance monitoring.
 * @version 1.0.0
 */
@Composable
fun VideoConsultationScreen(
    navController: NavController,
    consultationId: String,
    viewModel: VideoConsultationViewModel
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val uiState by viewModel.uiState.collectAsState()
    
    var localVideoView: SurfaceViewRenderer? by remember { mutableStateOf(null) }
    var remoteVideoView: SurfaceViewRenderer? by remember { mutableStateOf(null) }

    // Performance monitoring
    LaunchedEffect(Unit) {
        viewModel.monitorPerformance()
    }

    // Security validation
    LaunchedEffect(consultationId) {
        scope.launch {
            viewModel.startSecureConsultation(consultationId)
        }
    }

    // Handle consultation lifecycle
    DisposableEffect(Unit) {
        onDispose {
            localVideoView?.release()
            remoteVideoView?.release()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // Loading state
        if (uiState.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color = MaterialTheme.colorScheme.primary
            )
        }

        // Error state
        uiState.error?.let { error ->
            ErrorDialog(
                error = error,
                onDismiss = { navController.popBackStack() }
            )
        }

        // Video consultation UI
        Column(modifier = Modifier.fillMaxSize()) {
            // Remote video (healthcare provider)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                AndroidView(
                    factory = { context ->
                        SurfaceViewRenderer(context).apply {
                            setEnableHardwareScaler(true)
                            setMirror(false)
                            remoteVideoView = this
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )

                // Network quality indicator
                NetworkQualityIndicator(
                    quality = uiState.networkQuality,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(16.dp)
                )
            }

            // Local video (patient)
            Box(
                modifier = Modifier
                    .width(120.dp)
                    .height(160.dp)
                    .padding(16.dp)
                    .align(Alignment.End)
            ) {
                AndroidView(
                    factory = { context ->
                        SurfaceViewRenderer(context).apply {
                            setEnableHardwareScaler(true)
                            setMirror(true)
                            localVideoView = this
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }

            // Control panel
            SecureVideoControls(
                viewModel = viewModel,
                uiState = uiState
            )
        }

        // Performance metrics overlay (debug mode only)
        if (AppConstants.APP.DEBUG_MODE) {
            PerformanceMetricsOverlay(
                metrics = uiState.performanceMetrics,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
            )
        }
    }
}

@Composable
private fun SecureVideoControls(
    viewModel: VideoConsultationViewModel,
    uiState: ConsultationUiState
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(80.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Camera toggle
            IconButton(
                onClick = { viewModel.toggleCamera() },
                enabled = !uiState.isLoading
            ) {
                Icon(
                    painter = painterResource(
                        id = if (uiState.isCameraEnabled) {
                            android.R.drawable.ic_menu_camera
                        } else {
                            android.R.drawable.ic_menu_camera // disabled icon
                        }
                    ),
                    contentDescription = "Toggle camera",
                    tint = if (uiState.isCameraEnabled) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    }
                )
            }

            // Microphone toggle
            IconButton(
                onClick = { viewModel.toggleMicrophone() },
                enabled = !uiState.isLoading
            ) {
                Icon(
                    painter = painterResource(
                        id = if (uiState.isMicrophoneEnabled) {
                            android.R.drawable.ic_btn_speak_now
                        } else {
                            android.R.drawable.ic_lock_silent_mode
                        }
                    ),
                    contentDescription = "Toggle microphone",
                    tint = if (uiState.isMicrophoneEnabled) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    }
                )
            }

            // End call button
            Button(
                onClick = { viewModel.endConsultation() },
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                ),
                enabled = !uiState.isLoading
            ) {
                Text("End Call")
            }
        }
    }
}

@Composable
private fun NetworkQualityIndicator(
    quality: NetworkQuality,
    modifier: Modifier = Modifier
) {
    val qualityColor = when {
        quality.packetLoss < 0.01f -> MaterialTheme.colorScheme.primary
        quality.packetLoss < 0.05f -> MaterialTheme.colorScheme.secondary
        else -> MaterialTheme.colorScheme.error
    }

    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
        shape = MaterialTheme.shapes.small
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                painter = painterResource(
                    id = android.R.drawable.ic_menu_rotate
                ),
                contentDescription = "Network quality",
                tint = qualityColor
            )
            Text(
                text = "${(quality.bitrate / 1000)}kbps",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

@Composable
private fun ErrorDialog(
    error: String,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Error") },
        text = { Text(error) },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("OK")
            }
        }
    )
}

@Composable
private fun PerformanceMetricsOverlay(
    metrics: PerformanceMetrics,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
        shape = MaterialTheme.shapes.small
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = "CPU: ${metrics.cpuUsage}%",
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                text = "Memory: ${metrics.memoryUsage / 1024 / 1024}MB",
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                text = "FPS: ${metrics.frameRate}",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
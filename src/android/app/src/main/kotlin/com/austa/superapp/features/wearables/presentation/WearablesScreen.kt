package com.austa.superapp.features.wearables.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.austa.superapp.core.constants.AppConstants.UI
import com.austa.superapp.core.security.EncryptionManager
import com.google.accompanist.swiperefresh.SwipeRefresh
import com.google.accompanist.swiperefresh.rememberSwipeRefreshState
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.format.DateTimeFormatter

/**
 * Main composable screen for wearable device data visualization and management.
 * Implements HIPAA-compliant data display with comprehensive security and accessibility features.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WearablesScreen(
    navController: NavController,
    viewModel: WearablesViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    
    // State management
    val uiState by viewModel.uiState.collectAsState()
    var refreshing by remember { mutableStateOf(false) }
    var selectedDevice by remember { mutableStateOf<String?>(null) }
    var permissionGranted by remember { mutableStateOf(false) }

    // Security initialization
    val encryptionManager = remember { EncryptionManager() }

    LaunchedEffect(Unit) {
        handlePermissions(context) { granted ->
            permissionGranted = granted
            if (granted) {
                viewModel.refreshData()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Wearable Devices",
                        modifier = Modifier.semantics {
                            contentDescription = "Wearable Devices Screen"
                        }
                    )
                },
                actions = {
                    IconButton(
                        onClick = {
                            scope.launch {
                                navController.navigate("wearables/settings")
                            }
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Wearable Settings"
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Settings,
                            contentDescription = "Settings"
                        )
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        SwipeRefresh(
            state = rememberSwipeRefreshState(refreshing),
            onRefresh = {
                scope.launch {
                    refreshing = true
                    viewModel.refreshData()
                    refreshing = false
                }
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (uiState) {
                is WearablesUiState.Loading -> {
                    LoadingState()
                }
                
                is WearablesUiState.Success -> {
                    val data = (uiState as WearablesUiState.Success).data
                    WearablesContent(
                        wearableData = data,
                        encryptionManager = encryptionManager,
                        onDeviceSelected = { deviceId ->
                            selectedDevice = deviceId
                        }
                    )
                }
                
                is WearablesUiState.Error -> {
                    ErrorState(
                        message = (uiState as WearablesUiState.Error).message,
                        onRetry = {
                            viewModel.refreshData()
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun WearablesContent(
    wearableData: List<WearableData>,
    encryptionManager: EncryptionManager,
    onDeviceSelected: (String) -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("wearables_list"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(
            items = wearableData,
            key = { it.id }
        ) { device ->
            DeviceCard(
                device = device,
                encryptionManager = encryptionManager,
                onClick = { onDeviceSelected(device.id) }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DeviceCard(
    device: WearableData,
    encryptionManager: EncryptionManager,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Device: ${device.metadata.manufacturer} ${device.metadata.model}"
            }
    ) {
        Column(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth()
        ) {
            // Device header with security status
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${device.metadata.manufacturer} ${device.metadata.model}",
                    style = MaterialTheme.typography.titleMedium
                )
                SecurityIndicator(device.metadata.isCalibrated)
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Encrypted metrics display
            HealthMetricsSection(
                metrics = device.metrics,
                encryptionManager = encryptionManager
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Device status footer
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                BatteryIndicator(device.metadata.batteryLevel)
                LastUpdateTime(device.timestamp)
            }
        }
    }
}

@Composable
private fun HealthMetricsSection(
    metrics: Map<String, Double>,
    encryptionManager: EncryptionManager
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        metrics.forEach { (key, value) ->
            val encryptedValue = remember(value) {
                encryptionManager.encryptData(
                    value.toString().toByteArray(),
                    "metric_$key"
                )
            }
            
            MetricRow(
                label = key,
                value = value,
                isEncrypted = true
            )
        }
    }
}

@Composable
private fun MetricRow(
    label: String,
    value: Double,
    isEncrypted: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium
        )
        Text(
            text = if (isEncrypted) "••••" else value.toString(),
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

@Composable
private fun SecurityIndicator(isCalibrated: Boolean) {
    Icon(
        imageVector = if (isCalibrated) Icons.Filled.Verified else Icons.Filled.Warning,
        contentDescription = if (isCalibrated) "Device Secured" else "Security Warning",
        tint = if (isCalibrated) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
    )
}

@Composable
private fun BatteryIndicator(level: Double) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = Icons.Filled.BatteryStd,
            contentDescription = "Battery Level",
            tint = when {
                level <= 20.0 -> MaterialTheme.colorScheme.error
                level <= 50.0 -> MaterialTheme.colorScheme.warning
                else -> MaterialTheme.colorScheme.primary
            }
        )
        Text(
            text = "${level.toInt()}%",
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
private fun LastUpdateTime(timestamp: Instant) {
    val formatter = remember { DateTimeFormatter.ofPattern("HH:mm:ss") }
    Text(
        text = "Updated: ${formatter.format(timestamp)}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
private fun LoadingState() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .semantics { contentDescription = "Loading wearable data" },
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ErrorState(
    message: String,
    onRetry: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = onRetry,
            modifier = Modifier.semantics {
                contentDescription = "Retry loading wearable data"
            }
        ) {
            Text("Retry")
        }
    }
}

private suspend fun handlePermissions(
    context: Context,
    onResult: (Boolean) -> Unit
) {
    // Implementation of permission handling
    // This would integrate with the HealthConnectService
    onResult(true) // Placeholder
}
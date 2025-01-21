package com.austa.superapp.features.dashboard.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavController
import com.austa.superapp.core.constants.AppConstants.SECURITY
import com.austa.superapp.core.constants.AppConstants.UI
import com.austa.superapp.features.dashboard.domain.models.HealthMetric
import com.austa.superapp.features.dashboard.presentation.components.HealthMetricsCard
import com.google.accompanist.swiperefresh.SwipeRefresh
import com.google.accompanist.swiperefresh.rememberSwipeRefreshState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Secure dashboard screen implementation for AUSTA SuperApp with HIPAA compliance.
 * Implements real-time health metrics display with comprehensive security measures.
 */
@Composable
fun DashboardScreen(
    navController: NavController,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Collect UI state with security validation
    val uiState by viewModel.uiState.collectAsState()
    var isRefreshing by remember { mutableStateOf(false) }
    
    // Session monitoring
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> {
                    coroutineScope.launch {
                        viewModel.validateSession()
                    }
                }
                Lifecycle.Event.ON_PAUSE -> {
                    // Clear sensitive data from memory
                    viewModel.clearSensitiveData()
                }
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Auto-refresh timer
    LaunchedEffect(Unit) {
        while (true) {
            delay(UI.REFRESH_INTERVAL_MS)
            viewModel.refreshDashboard()
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        topBar = {
            DashboardTopBar(
                onSettingsClick = { navController.navigate("settings") },
                onProfileClick = { navController.navigate("profile") }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        SwipeRefresh(
            state = rememberSwipeRefreshState(isRefreshing),
            onRefresh = {
                coroutineScope.launch {
                    isRefreshing = true
                    viewModel.refreshDashboard()
                    delay(1000) // Minimum refresh indicator display time
                    isRefreshing = false
                }
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (uiState) {
                is DashboardUiState.Loading -> {
                    LoadingContent()
                }
                is DashboardUiState.Success -> {
                    DashboardContent(
                        uiState = uiState as DashboardUiState.Success,
                        onMetricClick = { metric ->
                            navController.navigate("metric_details/${metric.id}")
                        },
                        onQuickActionClick = { action ->
                            viewModel.handleQuickAction(action)
                        }
                    )
                }
                is DashboardUiState.Error -> {
                    ErrorContent(
                        message = (uiState as DashboardUiState.Error).message,
                        onRetry = {
                            coroutineScope.launch {
                                viewModel.refreshDashboard()
                            }
                        }
                    )
                }
                is DashboardUiState.Unauthorized -> {
                    LaunchedEffect(Unit) {
                        navController.navigate("login") {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DashboardTopBar(
    onSettingsClick: () -> Unit,
    onProfileClick: () -> Unit
) {
    TopAppBar(
        title = {
            Text(
                text = stringResource(id = android.R.string.dashboard_title),
                style = MaterialTheme.typography.titleLarge
            )
        },
        actions = {
            IconButton(
                onClick = onSettingsClick,
                modifier = Modifier.semantics {
                    contentDescription = "Settings"
                }
            ) {
                Icon(
                    imageVector = Icons.Filled.Settings,
                    contentDescription = null
                )
            }
            IconButton(
                onClick = onProfileClick,
                modifier = Modifier.semantics {
                    contentDescription = "Profile"
                }
            ) {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = null
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    )
}

@Composable
private fun DashboardContent(
    uiState: DashboardUiState.Success,
    onMetricClick: (HealthMetric) -> Unit,
    onQuickActionClick: (QuickActionType) -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            QuickActionsSection(onQuickActionClick)
        }
        
        item {
            HealthMetricsCard(
                metrics = uiState.metrics,
                isLoading = false,
                isError = false,
                onMetricClick = onMetricClick,
                onRetry = {}
            )
        }
        
        item {
            LastUpdatedText(timestamp = uiState.lastUpdated)
        }
    }
}

@Composable
private fun LoadingContent() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(
            modifier = Modifier.semantics {
                contentDescription = "Loading dashboard"
            }
        )
    }
}

@Composable
private fun ErrorContent(
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
                contentDescription = "Retry loading dashboard"
            }
        ) {
            Text(text = stringResource(id = android.R.string.retry))
        }
    }
}

@Composable
private fun QuickActionsSection(
    onQuickActionClick: (QuickActionType) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = stringResource(id = android.R.string.quick_actions),
                style = MaterialTheme.typography.titleMedium
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                QuickActionButton(
                    type = QuickActionType.NEW_APPOINTMENT,
                    onClick = onQuickActionClick
                )
                QuickActionButton(
                    type = QuickActionType.SUBMIT_CLAIM,
                    onClick = onQuickActionClick
                )
                QuickActionButton(
                    type = QuickActionType.VIEW_RECORDS,
                    onClick = onQuickActionClick
                )
            }
        }
    }
}

@Composable
private fun QuickActionButton(
    type: QuickActionType,
    onClick: (QuickActionType) -> Unit
) {
    OutlinedButton(
        onClick = { onClick(type) },
        modifier = Modifier.semantics {
            contentDescription = type.toString()
        }
    ) {
        Text(text = type.toDisplayString())
    }
}

@Composable
private fun LastUpdatedText(timestamp: java.time.Instant) {
    Text(
        text = "Last updated: ${formatTimestamp(timestamp)}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 8.dp)
    )
}

private fun formatTimestamp(timestamp: java.time.Instant): String {
    val now = java.time.Instant.now()
    val minutes = java.time.temporal.ChronoUnit.MINUTES.between(timestamp, now)
    return when {
        minutes < 1 -> "Just now"
        minutes < 60 -> "$minutes minutes ago"
        minutes < 1440 -> "${minutes / 60} hours ago"
        else -> "${minutes / 1440} days ago"
    }
}

enum class QuickActionType {
    NEW_APPOINTMENT,
    SUBMIT_CLAIM,
    VIEW_RECORDS;

    fun toDisplayString(): String = when (this) {
        NEW_APPOINTMENT -> "New Appointment"
        SUBMIT_CLAIM -> "Submit Claim"
        VIEW_RECORDS -> "View Records"
    }
}
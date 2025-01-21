package com.austa.superapp.features.healthrecords.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import com.austa.superapp.features.healthrecords.domain.models.HealthRecord
import com.austa.superapp.features.healthrecords.domain.models.HealthRecordType
import com.austa.superapp.features.healthrecords.presentation.components.DocumentViewer
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.security.EncryptionManager
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * HIPAA-compliant health records screen implementing comprehensive security and accessibility.
 * Version: 1.0.0
 */
@Composable
fun HealthRecordsScreen(
    modifier: Modifier = Modifier,
    onRecordClick: (String) -> Unit,
    securityContext: SecurityContext,
    viewModel: HealthRecordsViewModel = viewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    
    // State management
    val uiState by viewModel.uiState.collectAsState()
    var selectedRecord by remember { mutableStateOf<HealthRecord?>(null) }
    var showDocumentViewer by remember { mutableStateOf(false) }
    
    // Security setup
    val sessionId = remember { UUID.randomUUID().toString() }
    val encryptionManager = remember { EncryptionManager() }
    
    // Lifecycle monitoring for security
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> {
                    viewModel.validateSecurity(securityContext)
                    viewModel.logAuditEvent(
                        sessionId,
                        "SCREEN_RESUMED",
                        securityContext.userId
                    )
                }
                Lifecycle.Event.ON_PAUSE -> {
                    viewModel.logAuditEvent(
                        sessionId,
                        "SCREEN_PAUSED",
                        securityContext.userId
                    )
                }
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Load records on launch
    LaunchedEffect(Unit) {
        viewModel.loadHealthRecords(securityContext.patientId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Health Records",
                        modifier = Modifier.semantics {
                            contentDescription = "Health Records Screen Title"
                        }
                    )
                },
                actions = {
                    // Upload action
                    IconButton(
                        onClick = {
                            scope.launch {
                                viewModel.logAuditEvent(
                                    sessionId,
                                    "UPLOAD_INITIATED",
                                    securityContext.userId
                                )
                                // Upload implementation
                            }
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Upload Health Record"
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Upload,
                            contentDescription = "Upload"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Type filters
            FilterChipGroup(
                selectedTypes = uiState.selectedTypes,
                onTypeSelected = { type ->
                    viewModel.updateTypeFilter(type)
                    viewModel.logAuditEvent(
                        sessionId,
                        "FILTER_CHANGED",
                        "type: $type"
                    )
                }
            )

            when {
                uiState.isLoading -> {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .align(Alignment.CenterHorizontally)
                            .padding(16.dp)
                    )
                }
                
                uiState.error != null -> {
                    ErrorMessage(
                        message = uiState.error.message,
                        modifier = Modifier.padding(16.dp)
                    )
                }
                
                uiState.records.isEmpty() -> {
                    EmptyStateMessage(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp)
                    )
                }
                
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(
                            items = uiState.records,
                            key = { it.id }
                        ) { record ->
                            HealthRecordItem(
                                record = record,
                                securityContext = securityContext,
                                onClick = {
                                    selectedRecord = record
                                    showDocumentViewer = true
                                    viewModel.logAuditEvent(
                                        sessionId,
                                        "RECORD_SELECTED",
                                        "recordId: ${record.id}"
                                    )
                                    onRecordClick(record.id)
                                }
                            )
                        }
                    }
                }
            }
        }

        // Document viewer dialog
        if (showDocumentViewer && selectedRecord != null) {
            DocumentViewer(
                attachment = selectedRecord!!.attachments.first(),
                securityContext = securityContext,
                onClose = {
                    showDocumentViewer = false
                    selectedRecord = null
                    viewModel.logAuditEvent(
                        sessionId,
                        "VIEWER_CLOSED",
                        "recordId: ${selectedRecord?.id}"
                    )
                }
            )
        }
    }
}

@Composable
private fun FilterChipGroup(
    selectedTypes: Set<HealthRecordType>,
    onTypeSelected: (HealthRecordType) -> Unit
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(HealthRecordType.values()) { type ->
            FilterChip(
                selected = type in selectedTypes,
                onClick = { onTypeSelected(type) },
                label = {
                    Text(
                        text = type.name.replace("_", " "),
                        style = MaterialTheme.typography.bodyMedium
                    )
                },
                modifier = Modifier.semantics {
                    contentDescription = "Filter by ${type.name}"
                }
            )
        }
    }
}

@Composable
private fun HealthRecordItem(
    record: HealthRecord,
    securityContext: SecurityContext,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Health record from ${record.date}"
            },
        onClick = onClick
    ) {
        Column(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth()
        ) {
            Text(
                text = record.type.name.replace("_", " "),
                style = MaterialTheme.typography.titleMedium
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Date: ${record.date}",
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Provider: ${record.providerId}",
                style = MaterialTheme.typography.bodyMedium
            )
            
            // Security indicators
            if (record.securityLabels.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    record.securityLabels.forEach { label ->
                        SecurityLabel(label)
                    }
                }
            }
        }
    }
}

@Composable
private fun SecurityLabel(label: String) {
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun ErrorMessage(
    message: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Error",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

@Composable
private fun EmptyStateMessage(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "No health records found",
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Upload your first health record to get started",
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
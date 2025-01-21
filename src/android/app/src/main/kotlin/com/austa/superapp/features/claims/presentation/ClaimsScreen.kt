package com.austa.superapp.features.claims.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.austa.superapp.R
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.features.claims.domain.models.Claim
import com.austa.superapp.features.claims.domain.models.ClaimStatus
import com.google.accompanist.swiperefresh.SwipeRefresh
import com.google.accompanist.swiperefresh.rememberSwipeRefreshState
import java.text.NumberFormat
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * Main composable for the claims management screen.
 * Implements Material3 design with enhanced accessibility and performance optimizations.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClaimsScreen(
    modifier: Modifier = Modifier,
    viewModel: ClaimsViewModel = hiltViewModel(),
    onClaimClick: (String) -> Unit,
    onNewClaim: () -> Unit
) {
    val uiState by viewModel.claims.collectAsStateWithLifecycle()
    val loadingState by viewModel.loadingState.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val isRefreshing = loadingState is ClaimsViewModel.LoadingState.Loading
    val context = LocalContext.current

    // Error dialog state
    var showErrorDialog by remember { mutableStateOf(false) }
    error?.let {
        showErrorDialog = true
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            ClaimsTopBar(
                isRefreshing = isRefreshing,
                onRefresh = { viewModel.loadUserClaims(true) }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNewClaim,
                modifier = Modifier.semantics {
                    contentDescription = "Add new claim"
                }
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_add),
                    contentDescription = "Add"
                )
            }
        }
    ) { paddingValues ->
        SwipeRefresh(
            state = rememberSwipeRefreshState(isRefreshing),
            onRefresh = { viewModel.loadUserClaims(true) },
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    uiState.isEmpty() && !isRefreshing -> {
                        EmptyClaimsState(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp)
                        )
                    }
                    else -> {
                        ClaimsList(
                            claims = uiState,
                            onClaimClick = onClaimClick,
                            listState = listState,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }

                // Loading indicator
                if (isRefreshing) {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.TopCenter)
                    )
                }
            }
        }

        // Error Dialog
        if (showErrorDialog) {
            AlertDialog(
                onDismissRequest = {
                    showErrorDialog = false
                    viewModel.clearError()
                },
                title = { Text("Error") },
                text = { Text(error?.message ?: "An unknown error occurred") },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showErrorDialog = false
                            viewModel.clearError()
                            viewModel.loadUserClaims(true)
                        }
                    ) {
                        Text("Retry")
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = {
                            showErrorDialog = false
                            viewModel.clearError()
                        }
                    ) {
                        Text("Dismiss")
                    }
                }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ClaimsTopBar(
    isRefreshing: Boolean,
    onRefresh: () -> Unit
) {
    TopAppBar(
        title = {
            Text(
                text = "Insurance Claims",
                style = MaterialTheme.typography.titleLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        actions = {
            IconButton(
                onClick = onRefresh,
                enabled = !isRefreshing,
                modifier = Modifier.semantics {
                    contentDescription = "Refresh claims"
                }
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_refresh),
                    contentDescription = "Refresh"
                )
            }
        }
    )
}

@Composable
private fun ClaimsList(
    claims: List<Claim>,
    onClaimClick: (String) -> Unit,
    listState: LazyListState,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        state = listState,
        modifier = modifier
            .testTag("claims_list")
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(
            items = claims,
            key = { it.id }
        ) { claim ->
            ClaimCard(
                claim = claim,
                onClick = { onClaimClick(claim.id) }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ClaimCard(
    claim: Claim,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val currencyFormatter = remember { NumberFormat.getCurrencyInstance() }
    val dateFormatter = remember { DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM) }

    Card(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Claim for ${currencyFormatter.format(claim.amount)}"
            }
    ) {
        Column(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = claim.type.toString(),
                    style = MaterialTheme.typography.titleMedium
                )
                ClaimStatusChip(status = claim.status)
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = currencyFormatter.format(claim.amount),
                style = MaterialTheme.typography.headlineSmall
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = "Submitted: ${dateFormatter.format(claim.submissionDate)}",
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

@Composable
private fun ClaimStatusChip(
    status: ClaimStatus,
    modifier: Modifier = Modifier
) {
    val (color, text) = when (status) {
        ClaimStatus.SUBMITTED -> MaterialTheme.colorScheme.primary to "Submitted"
        ClaimStatus.IN_REVIEW -> MaterialTheme.colorScheme.tertiary to "In Review"
        ClaimStatus.APPROVED -> MaterialTheme.colorScheme.secondary to "Approved"
        ClaimStatus.REJECTED -> MaterialTheme.colorScheme.error to "Rejected"
        ClaimStatus.PENDING_INFO -> MaterialTheme.colorScheme.outline to "Pending Info"
    }

    SuggestionChip(
        onClick = null,
        label = { Text(text) },
        colors = SuggestionChipDefaults.suggestionChipColors(
            containerColor = color.copy(alpha = 0.1f),
            labelColor = color
        ),
        modifier = modifier
    )
}

@Composable
private fun EmptyClaimsState(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            painter = painterResource(id = R.drawable.ic_empty_claims),
            contentDescription = null,
            modifier = Modifier.size(120.dp),
            tint = MaterialTheme.colorScheme.outline
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "No claims yet",
            style = MaterialTheme.typography.titleLarge
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Submit a new claim using the button below",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
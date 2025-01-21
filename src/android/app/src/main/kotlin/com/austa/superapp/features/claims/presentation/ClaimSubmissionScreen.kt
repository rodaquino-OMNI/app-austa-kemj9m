package com.austa.superapp.features.claims.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.utils.ValidationUtils
import com.austa.superapp.features.claims.domain.models.Claim
import com.austa.superapp.features.claims.domain.models.ClaimType
import com.austa.superapp.features.claims.domain.models.ClaimMetadata
import java.util.Date

@Composable
fun ClaimSubmissionScreen(
    navController: NavController,
    viewModel: ClaimsViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()
    var formState by remember { mutableStateOf(ClaimFormState()) }
    var isSubmitting by remember { mutableStateOf(false) }
    var showErrorDialog by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf("") }

    LaunchedEffect(viewModel.uiState) {
        viewModel.uiState.collect { state ->
            when (state) {
                is ClaimsViewModel.LoadingState.Success -> {
                    isSubmitting = false
                    navController.popBackStack()
                }
                is ClaimsViewModel.LoadingState.Error -> {
                    isSubmitting = false
                    errorMessage = state.toString()
                    showErrorDialog = true
                }
                is ClaimsViewModel.LoadingState.Loading -> {
                    isSubmitting = true
                }
                else -> Unit
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Submit Claim",
                        modifier = Modifier.semantics {
                            contentDescription = "Submit Insurance Claim Screen"
                        }
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = { navController.popBackStack() },
                        modifier = Modifier.semantics {
                            contentDescription = "Navigate back"
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(scrollState)
                .padding(16.dp)
                .testTag("claimSubmissionForm"),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            ClaimFormSection(
                formState = formState,
                onValueChange = { updatedState -> formState = updatedState },
                onError = { error -> 
                    errorMessage = error
                    showErrorDialog = true
                }
            )

            DocumentUploadSection(
                documents = formState.documents,
                onDocumentAdd = { uri ->
                    formState = formState.copy(
                        documents = formState.documents + uri,
                        hasChanges = true
                    )
                },
                onDocumentRemove = { uri ->
                    formState = formState.copy(
                        documents = formState.documents - uri,
                        hasChanges = true
                    )
                },
                onError = { error ->
                    errorMessage = error
                    showErrorDialog = true
                }
            )

            Button(
                onClick = {
                    if (validateForm(formState)) {
                        submitClaim(formState, viewModel)
                    } else {
                        showErrorDialog = true
                        errorMessage = "Please fill all required fields correctly"
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Submit claim button"
                    },
                enabled = !isSubmitting && formState.hasChanges
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text("Submit Claim")
                }
            }
        }

        if (showErrorDialog) {
            AlertDialog(
                onDismissRequest = { showErrorDialog = false },
                title = { Text("Error") },
                text = { Text(errorMessage) },
                confirmButton = {
                    TextButton(
                        onClick = { showErrorDialog = false }
                    ) {
                        Text("OK")
                    }
                }
            )
        }
    }
}

@Composable
private fun ClaimFormSection(
    formState: ClaimFormState,
    onValueChange: (ClaimFormState) -> Unit,
    onError: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        // Claim Type Selection
        OutlinedCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "Claim Type",
                    style = MaterialTheme.typography.titleMedium
                )
                ClaimType.values().forEach { type ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = formState.type == type,
                            onClick = {
                                onValueChange(formState.copy(
                                    type = type,
                                    hasChanges = true
                                ))
                            }
                        )
                        Text(
                            text = type.name,
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }
                }
            }
        }

        // Amount Field
        OutlinedTextField(
            value = formState.amount,
            onValueChange = { value ->
                val sanitized = ValidationUtils.sanitizeInput(value)
                if (sanitized.matches(Regex("^\\d*\\.?\\d{0,2}$"))) {
                    onValueChange(formState.copy(
                        amount = sanitized,
                        hasChanges = true
                    ))
                }
            },
            label = { Text("Amount") },
            keyboardType = KeyboardType.Decimal,
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "Enter claim amount"
                }
        )

        // Service Date Picker
        // Implementation of secure date picker would go here

        // Provider ID Field
        OutlinedTextField(
            value = formState.providerId,
            onValueChange = { value ->
                val sanitized = ValidationUtils.sanitizeInput(value)
                onValueChange(formState.copy(
                    providerId = sanitized,
                    hasChanges = true
                ))
            },
            label = { Text("Provider ID") },
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "Enter provider ID"
                }
        )

        // Additional form fields...
    }
}

@Composable
private fun DocumentUploadSection(
    documents: List<Uri>,
    onDocumentAdd: (Uri) -> Unit,
    onDocumentRemove: (Uri) -> Unit,
    onError: (String) -> Unit
) {
    // Document upload implementation with security checks
    // Would include file type validation, size limits, and encryption
}

private fun validateForm(formState: ClaimFormState): Boolean {
    return formState.type != null &&
           formState.amount.isNotBlank() &&
           formState.amount.toDoubleOrNull() != null &&
           formState.amount.toDouble() > 0 &&
           formState.amount.toDouble() <= AppConstants.CLAIMS.MAX_CLAIM_AMOUNT &&
           formState.providerId.isNotBlank() &&
           formState.documents.size <= AppConstants.CLAIMS.MAX_ATTACHMENTS
}

private fun submitClaim(formState: ClaimFormState, viewModel: ClaimsViewModel) {
    val claim = Claim(
        type = formState.type!!,
        amount = formState.amount.toDouble(),
        serviceDate = Date(), // Would use selected date
        providerId = formState.providerId,
        documents = formState.documents.map { /* Convert to ClaimDocument */ },
        metadata = ClaimMetadata(
            // Populate metadata
        )
    )
    viewModel.submitClaimSecure(claim)
}

data class ClaimFormState(
    val type: ClaimType? = null,
    val amount: String = "",
    val serviceDate: Long = 0,
    val providerId: String = "",
    val policyNumber: String = "",
    val diagnosisCodes: List<String> = emptyList(),
    val notes: String = "",
    val documents: List<Uri> = emptyList(),
    val validationErrors: Map<String, String> = emptyMap(),
    val isSubmitting: Boolean = false,
    val hasChanges: Boolean = false
)
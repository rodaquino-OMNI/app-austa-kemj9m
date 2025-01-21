package com.austa.superapp.features.auth.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.austa.superapp.R
import com.austa.superapp.core.security.BiometricManager
import com.austa.superapp.core.constants.AppConstants
import kotlinx.coroutines.launch

/**
 * HIPAA-compliant biometric authentication screen with comprehensive accessibility support
 * and hardware security verification.
 * Version: 1.0.0
 */
@Composable
fun BiometricAuthScreen(
    navController: NavController,
    viewModel: LoginViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val uiState by viewModel.uiState.collectAsState()
    var showErrorDialog by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        when (val capability = BiometricManager(context).checkBiometricCapability()) {
            is BiometricManager.BiometricCapabilityResult.Available -> {
                BiometricPrompt(viewModel = viewModel)
            }
            is BiometricManager.BiometricCapabilityResult.HardwareUnavailable -> {
                errorMessage = "Biometric hardware not available"
                showErrorDialog = true
            }
            is BiometricManager.BiometricCapabilityResult.NoBiometricEnrolled -> {
                errorMessage = "No biometric credentials enrolled"
                showErrorDialog = true
            }
            is BiometricManager.BiometricCapabilityResult.SecurityLevelInsufficient -> {
                errorMessage = "Device security level insufficient for HIPAA compliance"
                showErrorDialog = true
            }
            is BiometricManager.BiometricCapabilityResult.HardwareBackedKeysUnavailable -> {
                errorMessage = "Hardware security module not available"
                showErrorDialog = true
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = "Biometric authentication screen" }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Icon(
                painter = painterResource(id = R.drawable.ic_fingerprint),
                contentDescription = "Fingerprint icon",
                modifier = Modifier
                    .size(72.dp)
                    .semantics { contentDescription = "Biometric authentication icon" },
                tint = MaterialTheme.colorScheme.primary
            )

            Text(
                text = "Biometric Authentication",
                style = MaterialTheme.typography.headlineMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { contentDescription = "Screen title" }
            )

            Text(
                text = "Please authenticate using your biometric credentials",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { contentDescription = "Authentication instruction" }
            )

            if (uiState.isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.semantics { 
                        contentDescription = "Authentication in progress" 
                    }
                )
            }
        }

        if (showErrorDialog) {
            BiometricErrorDialog(
                error = errorMessage,
                onDismiss = {
                    showErrorDialog = false
                    navController.popBackStack()
                },
                onRetry = {
                    showErrorDialog = false
                    scope.launch {
                        BiometricPrompt(viewModel = viewModel)
                    }
                }
            )
        }
    }
}

@Composable
private fun BiometricPrompt(
    viewModel: LoginViewModel,
    biometricManager: BiometricManager = BiometricManager(LocalContext.current)
) {
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        biometricManager.authenticateUser(
            activity = LocalContext.current as androidx.fragment.app.FragmentActivity,
            title = "Biometric Authentication",
            subtitle = "Authenticate to access your health records",
            callback = object : BiometricManager.AuthenticationCallback {
                override fun onSuccess() {
                    scope.launch {
                        viewModel.loginWithBiometric()
                    }
                }

                override fun onError(errorCode: Int, errorMessage: String) {
                    viewModel.handleAuthenticationError(errorMessage)
                }

                override fun onFailure() {
                    viewModel.handleAuthenticationError("Authentication failed")
                }
            }
        )
    }
}

@Composable
private fun BiometricErrorDialog(
    error: String,
    onDismiss: () -> Unit,
    onRetry: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Authentication Error",
                modifier = Modifier.semantics { 
                    contentDescription = "Error dialog title" 
                }
            )
        },
        text = {
            Text(
                text = error,
                modifier = Modifier.semantics { 
                    contentDescription = "Error message: $error" 
                }
            )
        },
        confirmButton = {
            TextButton(
                onClick = onRetry,
                modifier = Modifier.semantics { 
                    contentDescription = "Retry authentication button" 
                }
            ) {
                Text("Retry")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.semantics { 
                    contentDescription = "Cancel authentication button" 
                }
            ) {
                Text("Cancel")
            }
        }
    )
}

/**
 * Sealed class representing the biometric authentication screen states
 */
sealed class BiometricAuthState {
    data class Loading(val isLoading: Boolean = false) : BiometricAuthState()
    data class Error(val message: String) : BiometricAuthState()
    object Success : BiometricAuthState()
    
    fun isLocked(): Boolean {
        return when (this) {
            is Error -> this.message.contains("locked")
            else -> false
        }
    }
}
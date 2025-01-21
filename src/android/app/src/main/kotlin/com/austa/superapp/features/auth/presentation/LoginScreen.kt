package com.austa.superapp.features.auth.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.austa.superapp.R
import com.austa.superapp.core.constants.AppConstants
import com.austa.superapp.core.security.BiometricManager
import com.austa.superapp.core.utils.ValidationUtils
import kotlinx.coroutines.launch

/**
 * HIPAA-compliant login screen with comprehensive security features and accessibility support.
 * Implements Material3 design, biometric authentication, and secure input validation.
 */
@Composable
fun LoginScreen(
    navController: NavController,
    viewModel: LoginViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val loginState by viewModel.loginState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val emailFocusRequester = remember { FocusRequester() }
    val passwordFocusRequester = remember { FocusRequester() }

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isPasswordVisible by remember { mutableStateOf(false) }
    var isHighContrastEnabled by remember { mutableStateOf(false) }
    var textScale by remember { mutableStateOf(1f) }

    // Collect UI events
    LaunchedEffect(Unit) {
        viewModel.uiEvents.collect { event ->
            when (event) {
                is LoginUiEvent.LoginSuccess -> {
                    navController.navigate("dashboard") {
                        popUpTo("login") { inclusive = true }
                    }
                }
                is LoginUiEvent.Error -> {
                    snackbarHostState.showSnackbar(
                        message = event.message,
                        duration = SnackbarDuration.Long
                    )
                }
                is LoginUiEvent.MfaRequired -> {
                    navController.navigate("mfa/${event.method}")
                }
                is LoginUiEvent.SessionExpired -> {
                    snackbarHostState.showSnackbar(
                        message = "Session expired. Please login again.",
                        duration = SnackbarDuration.Short
                    )
                }
                else -> Unit
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        modifier = Modifier.semantics {
            contentDescription = "Login Screen"
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // App Logo
            Icon(
                painter = painterResource(R.drawable.app_logo),
                contentDescription = "AUSTA SuperApp Logo",
                modifier = Modifier
                    .size(120.dp)
                    .padding(bottom = 32.dp),
                tint = MaterialTheme.colorScheme.primary
            )

            // Email Field
            OutlinedTextField(
                value = email,
                onValueChange = { newValue ->
                    email = ValidationUtils.validateInputSecurity(newValue)
                },
                label = { Text("Email") },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next
                ),
                keyboardActions = KeyboardActions(
                    onNext = { passwordFocusRequester.requestFocus() }
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(emailFocusRequester)
                    .testTag("emailInput")
                    .semantics {
                        contentDescription = "Email Input Field"
                    },
                enabled = !loginState.isLoading,
                isError = loginState.error?.contains("email", ignoreCase = true) == true,
                singleLine = true
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Password Field
            OutlinedTextField(
                value = password,
                onValueChange = { newValue ->
                    password = ValidationUtils.validateInputSecurity(newValue)
                },
                label = { Text("Password") },
                visualTransformation = if (isPasswordVisible) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done
                ),
                keyboardActions = KeyboardActions(
                    onDone = {
                        if (!loginState.isLoading) {
                            scope.launch {
                                viewModel.login(email, password)
                            }
                        }
                    }
                ),
                trailingIcon = {
                    IconButton(
                        onClick = { isPasswordVisible = !isPasswordVisible },
                        modifier = Modifier.semantics {
                            contentDescription = if (isPasswordVisible) {
                                "Hide Password"
                            } else {
                                "Show Password"
                            }
                        }
                    ) {
                        Icon(
                            painter = painterResource(
                                if (isPasswordVisible) {
                                    R.drawable.ic_visibility_off
                                } else {
                                    R.drawable.ic_visibility
                                }
                            ),
                            contentDescription = null
                        )
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(passwordFocusRequester)
                    .testTag("passwordInput")
                    .semantics {
                        contentDescription = "Password Input Field"
                    },
                enabled = !loginState.isLoading,
                isError = loginState.error?.contains("password", ignoreCase = true) == true,
                singleLine = true
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Login Button
            Button(
                onClick = {
                    scope.launch {
                        viewModel.login(email, password)
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .testTag("loginButton")
                    .semantics {
                        contentDescription = "Login Button"
                    },
                enabled = !loginState.isLoading && email.isNotBlank() && password.isNotBlank()
            ) {
                if (loginState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text("Login")
                }
            }

            // Biometric Login Option
            if (loginState.isBiometricAvailable) {
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            viewModel.authenticateWithBiometric()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .testTag("biometricButton")
                        .semantics {
                            contentDescription = "Biometric Login Button"
                        },
                    enabled = !loginState.isLoading
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_fingerprint),
                        contentDescription = null,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text("Login with Biometric")
                }
            }

            // Accessibility Options
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // High Contrast Toggle
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.semantics {
                        contentDescription = "High Contrast Mode Toggle"
                    }
                ) {
                    Switch(
                        checked = isHighContrastEnabled,
                        onCheckedChange = { isHighContrastEnabled = it },
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text("High Contrast")
                }

                // Text Size Slider
                Slider(
                    value = textScale,
                    onValueChange = { textScale = it },
                    valueRange = 0.8f..1.4f,
                    steps = 3,
                    modifier = Modifier
                        .width(120.dp)
                        .semantics {
                            contentDescription = "Text Size Adjustment"
                        }
                )
            }

            // Error Display
            loginState.error?.let { error ->
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.semantics {
                        contentDescription = "Error Message: $error"
                    }
                )
            }

            // Remaining Attempts Display
            if (loginState.remainingAttempts < AppConstants.SECURITY.MAX_LOGIN_ATTEMPTS) {
                Text(
                    text = "Remaining attempts: ${loginState.remainingAttempts}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .semantics {
                            contentDescription = "Remaining login attempts: ${loginState.remainingAttempts}"
                        }
                )
            }
        }
    }
}
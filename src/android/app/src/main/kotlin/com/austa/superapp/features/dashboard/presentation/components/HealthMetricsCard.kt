package com.austa.superapp.features.dashboard.presentation.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.austa.superapp.features.dashboard.domain.models.HealthMetric
import com.austa.superapp.core.constants.AppConstants
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Default values and styling for the HealthMetricsCard component
 */
object MetricCardDefaults {
    val CARD_ELEVATION = 4.dp
    val GRID_SPACING = 8.dp
    val NORMAL_COLOR = Color(0xFF4CAF50)
    val ABNORMAL_COLOR = Color(0xFFE53935)
    val ANIMATION_DURATION = AppConstants.UI.ANIMATION_DURATION_MS
    const val DISABLED_ALPHA = 0.6f
    const val ERROR_RETRY_MAX_ATTEMPTS = 3
}

/**
 * A composable that displays health metrics in a card format with real-time updates
 * and device integration support.
 *
 * @param metrics List of health metrics to display
 * @param isLoading Loading state indicator
 * @param isError Error state indicator
 * @param onMetricClick Callback for metric click events
 * @param onRetry Callback for retry attempts on error
 */
@Composable
fun HealthMetricsCard(
    metrics: List<HealthMetric>,
    isLoading: Boolean,
    isError: Boolean,
    onMetricClick: (HealthMetric) -> Unit,
    onRetry: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = "Health Metrics Dashboard"
            },
        elevation = CardDefaults.cardElevation(defaultElevation = MetricCardDefaults.CARD_ELEVATION),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text(
                text = stringResource(id = android.R.string.health_metrics_title),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            when {
                isLoading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.semantics {
                                contentDescription = "Loading health metrics"
                            }
                        )
                    }
                }

                isError -> {
                    ErrorContent(onRetry)
                }

                metrics.isEmpty() -> {
                    EmptyContent()
                }

                else -> {
                    MetricsGrid(metrics, onMetricClick)
                }
            }
        }
    }
}

@Composable
private fun ErrorContent(onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(id = android.R.string.health_metrics_error),
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = onRetry,
            modifier = Modifier.semantics {
                contentDescription = "Retry loading health metrics"
            }
        ) {
            Text(text = stringResource(id = android.R.string.retry))
        }
    }
}

@Composable
private fun EmptyContent() {
    Text(
        text = stringResource(id = android.R.string.no_health_metrics),
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp)
    )
}

@Composable
private fun MetricsGrid(
    metrics: List<HealthMetric>,
    onMetricClick: (HealthMetric) -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(MetricCardDefaults.GRID_SPACING),
        verticalArrangement = Arrangement.spacedBy(MetricCardDefaults.GRID_SPACING),
        modifier = Modifier.fillMaxWidth()
    ) {
        items(metrics) { metric ->
            MetricItem(metric = metric, onClick = onMetricClick)
        }
    }
}

@Composable
private fun MetricItem(
    metric: HealthMetric,
    onClick: (HealthMetric) -> Unit
) {
    val haptic = LocalHapticFeedback.current
    var previousValue by remember { mutableStateOf(metric.value) }
    val animatedAlpha by animateFloatAsState(
        targetValue = if (previousValue != metric.value) 0.3f else 1f,
        animationSpec = tween(durationMillis = MetricCardDefaults.ANIMATION_DURATION.toInt())
    )

    LaunchedEffect(metric.value) {
        if (previousValue != metric.value) {
            previousValue = metric.value
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1.5f)
            .alpha(animatedAlpha)
            .semantics {
                contentDescription = "${metric.metricType}: ${metric.value} ${metric.unit}"
            },
        onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            onClick(metric)
        },
        colors = CardDefaults.cardColors(
            containerColor = if (metric.isNormal) 
                MetricCardDefaults.NORMAL_COLOR.copy(alpha = 0.1f)
            else 
                MetricCardDefaults.ABNORMAL_COLOR.copy(alpha = 0.1f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = formatMetricType(metric.metricType),
                style = MaterialTheme.typography.titleMedium,
                color = if (metric.isNormal) 
                    MetricCardDefaults.NORMAL_COLOR
                else 
                    MetricCardDefaults.ABNORMAL_COLOR
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "${metric.value} ${metric.unit}",
                style = MaterialTheme.typography.headlineMedium
            )
            
            metric.deviceData?.let { device ->
                Text(
                    text = device.deviceType,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Text(
                text = formatTimestamp(metric.timestamp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private fun formatMetricType(type: String): String {
    return type.replace("_", " ").lowercase().capitalize()
}

private fun formatTimestamp(timestamp: Instant): String {
    val now = Instant.now()
    val minutes = ChronoUnit.MINUTES.between(timestamp, now)
    
    return when {
        minutes < 1 -> "Just now"
        minutes < 60 -> "$minutes min ago"
        minutes < 1440 -> "${minutes / 60}h ago"
        else -> "${minutes / 1440}d ago"
    }
}
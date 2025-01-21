package com.austa.superapp.features.marketplace.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.austa.superapp.core.constants.AppConstants.UI
import com.austa.superapp.features.marketplace.domain.models.Product
import kotlinx.coroutines.launch

private const val IMAGE_CAROUSEL_HEIGHT = 300
private const val CONTENT_PADDING = 16
private const val SECTION_SPACING = 24
private const val ANIMATION_DURATION = 300

/**
 * Composable screen that displays detailed product information with loading, error,
 * and offline states. Implements Material Design 3 guidelines and accessibility support.
 */
@Composable
fun ProductDetailScreen(
    navController: NavController,
    productId: String,
    viewModel: MarketplaceViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(productId) {
        viewModel.getProductDetails(productId)
    }

    Scaffold(
        topBar = {
            ProductDetailTopBar(
                title = uiState.product?.name ?: "",
                onBackClick = { navController.navigateUp() },
                onShareClick = { /* Implement share functionality */ },
                isOffline = !viewModel.isNetworkAvailable()
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                uiState.isLoading -> ProductDetailSkeleton()
                uiState.error != null -> ProductDetailError(
                    error = uiState.error!!,
                    onRetry = { viewModel.retryLoadProduct(productId) }
                )
                uiState.product != null -> ProductDetailContent(
                    product = uiState.product!!,
                    onPurchase = { product ->
                        scope.launch {
                            viewModel.purchaseProduct(product)
                            snackbarHostState.showSnackbar("Purchase initiated")
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun ProductDetailContent(
    product: Product,
    onPurchase: (Product) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(CONTENT_PADDING.dp)
    ) {
        item {
            ProductImageCarousel(
                images = product.images,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IMAGE_CAROUSEL_HEIGHT.dp)
                    .semantics { contentDescription = "Product images" }
            )
        }

        item {
            Spacer(modifier = Modifier.height(SECTION_SPACING.dp))
            Text(
                text = product.name,
                style = MaterialTheme.typography.headlineMedium
            )
        }

        item {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "$${product.price}",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.primary
            )
        }

        item {
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = product.description,
                style = MaterialTheme.typography.bodyLarge
            )
        }

        item {
            Spacer(modifier = Modifier.height(SECTION_SPACING.dp))
            Text(
                text = "Details",
                style = MaterialTheme.typography.titleLarge
            )
            
            product.details.let { details ->
                Column(modifier = Modifier.padding(vertical = 8.dp)) {
                    ListItem(
                        headlineContent = { Text("Duration") },
                        supportingContent = { Text("${details.duration} minutes") }
                    )
                    ListItem(
                        headlineContent = { Text("Format") },
                        supportingContent = { Text(details.format) }
                    )
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "Prerequisites",
                style = MaterialTheme.typography.titleMedium
            )
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                items(product.details.prerequisites) { prerequisite ->
                    SuggestionChip(
                        onClick = { },
                        label = { Text(prerequisite) }
                    )
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = { onPurchase(product) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
            ) {
                Text("Purchase Now")
            }
        }
    }
}

@Composable
private fun ProductImageCarousel(
    images: List<String>,
    modifier: Modifier = Modifier
) {
    var currentPage by remember { mutableStateOf(0) }

    Column(modifier = modifier) {
        HorizontalPager(
            pageCount = images.size,
            state = rememberPagerState { images.size }
        ) { page ->
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(images[page])
                    .crossfade(UI.ANIMATION_DURATION_MS.toInt())
                    .build(),
                contentDescription = "Product image ${page + 1} of ${images.size}",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }

        if (images.size > 1) {
            HorizontalPagerIndicator(
                pageCount = images.size,
                currentPage = currentPage,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(16.dp)
            )
        }
    }
}

@Composable
private fun ProductDetailSkeleton() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(CONTENT_PADDING.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(IMAGE_CAROUSEL_HEIGHT.dp)
                .shimmer()
        )
        
        Spacer(modifier = Modifier.height(SECTION_SPACING.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth(0.7f)
                .height(24.dp)
                .shimmer()
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth(0.4f)
                .height(20.dp)
                .shimmer()
        )
    }
}

@Composable
private fun ProductDetailError(
    error: String,
    onRetry: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(CONTENT_PADDING.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = error,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onRetry) {
            Text("Retry")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProductDetailTopBar(
    title: String,
    onBackClick: () -> Unit,
    onShareClick: () -> Unit,
    isOffline: Boolean
) {
    TopAppBar(
        title = {
            Text(
                text = title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        navigationIcon = {
            IconButton(onClick = onBackClick) {
                Icon(
                    imageVector = Icons.Filled.ArrowBack,
                    contentDescription = "Navigate back"
                )
            }
        },
        actions = {
            if (isOffline) {
                Icon(
                    imageVector = Icons.Filled.CloudOff,
                    contentDescription = "Offline mode",
                    tint = MaterialTheme.colorScheme.error
                )
            }
            IconButton(onClick = onShareClick) {
                Icon(
                    imageVector = Icons.Filled.Share,
                    contentDescription = "Share product"
                )
            }
        }
    )
}
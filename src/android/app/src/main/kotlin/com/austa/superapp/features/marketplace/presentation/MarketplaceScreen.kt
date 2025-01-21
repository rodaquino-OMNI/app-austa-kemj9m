package com.austa.superapp.features.marketplace.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.austa.superapp.core.constants.AppConstants.UI
import com.austa.superapp.features.marketplace.domain.models.Product
import com.google.accompanist.swiperefresh.SwipeRefresh
import com.google.accompanist.swiperefresh.rememberSwipeRefreshState
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

private const val GRID_COLUMNS = 2
private const val MIN_CELL_WIDTH = 156
private const val CARD_PADDING = 8
private const val SEARCH_DEBOUNCE_MS = 300L
private const val MAX_FILTER_SELECTIONS = 5
private const val SCROLL_THRESHOLD = 50

@Composable
fun MarketplaceScreen(
    navController: NavController,
    viewModel: MarketplaceViewModel = hiltViewModel()
) {
    val scope = rememberCoroutineScope()
    val uiState by viewModel.uiState.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    
    var isFilterSheetVisible by remember { mutableStateOf(false) }
    var isSearchActive by remember { mutableStateOf(false) }
    
    val gridState = rememberLazyGridState()
    val swipeRefreshState = rememberSwipeRefreshState(uiState.isRefreshing)
    
    val screenWidth = LocalConfiguration.current.screenWidthDp
    val columns = (screenWidth / MIN_CELL_WIDTH).coerceAtLeast(GRID_COLUMNS)

    LaunchedEffect(Unit) {
        viewModel.loadProducts()
    }

    // Handle pagination
    LaunchedEffect(gridState) {
        snapshotFlow { gridState.layoutInfo.visibleItemsInfo }
            .collectLatest { visibleItems ->
                val lastVisibleItem = visibleItems.lastOrNull()?.index ?: return@collectLatest
                if (lastVisibleItem >= uiState.products.size - SCROLL_THRESHOLD && !uiState.isLoading && uiState.hasMorePages) {
                    viewModel.loadProducts(
                        category = selectedCategory,
                        page = uiState.currentPage + 1
                    )
                }
            }
    }

    Scaffold(
        topBar = {
            MarketplaceTopBar(
                searchQuery = searchQuery,
                onSearchQueryChange = { query ->
                    scope.launch {
                        viewModel.searchProducts(query, selectedCategory)
                    }
                },
                isSearchActive = isSearchActive,
                onFilterClick = { isFilterSheetVisible = true }
            )
        }
    ) { paddingValues ->
        SwipeRefresh(
            state = swipeRefreshState,
            onRefresh = { viewModel.refreshProducts() },
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    uiState.isLoading && uiState.products.isEmpty() -> {
                        LoadingPlaceholder()
                    }
                    uiState.error != null && uiState.products.isEmpty() -> {
                        ErrorState(
                            error = uiState.error!!,
                            onRetry = { viewModel.loadProducts(selectedCategory) }
                        )
                    }
                    uiState.products.isEmpty() -> {
                        EmptyState()
                    }
                    else -> {
                        ProductGrid(
                            products = uiState.products,
                            onProductClick = { productId ->
                                navController.navigate("product_details/$productId")
                            },
                            gridState = gridState,
                            columns = columns,
                            isLoading = uiState.isLoading
                        )
                    }
                }

                // Loading indicator for pagination
                if (uiState.isLoading && uiState.products.isNotEmpty()) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(16.dp)
                    )
                }
            }
        }

        if (isFilterSheetVisible) {
            FilterSheet(
                currentFilters = emptyMap(), // Replace with actual filters
                onFilterApply = { filters ->
                    // Handle filter application
                    isFilterSheetVisible = false
                },
                isVisible = isFilterSheetVisible,
                onDismiss = { isFilterSheetVisible = false }
            )
        }
    }
}

@Composable
private fun MarketplaceTopBar(
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    isSearchActive: Boolean,
    onFilterClick: () -> Unit
) {
    var localSearchQuery by remember { mutableStateOf(searchQuery) }
    
    LaunchedEffect(localSearchQuery) {
        kotlinx.coroutines.delay(SEARCH_DEBOUNCE_MS)
        if (localSearchQuery != searchQuery) {
            onSearchQueryChange(localSearchQuery)
        }
    }

    TopAppBar(
        title = {
            if (!isSearchActive) {
                Text(
                    text = stringResource(id = android.R.string.untitled),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        },
        actions = {
            SearchBar(
                query = localSearchQuery,
                onQueryChange = { localSearchQuery = it },
                active = isSearchActive,
                onActiveChange = { /* Handle search active state */ },
                placeholder = { Text("Search marketplace") },
                modifier = Modifier.semantics { 
                    contentDescription = "Search marketplace"
                }
            )
            IconButton(onClick = onFilterClick) {
                Icon(
                    imageVector = Icons.Filled.FilterList,
                    contentDescription = "Filter"
                )
            }
        }
    )
}

@Composable
private fun ProductGrid(
    products: List<Product>,
    onProductClick: (String) -> Unit,
    gridState: LazyGridState,
    columns: Int,
    isLoading: Boolean
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        state = gridState,
        contentPadding = PaddingValues(CARD_PADDING.dp),
        horizontalArrangement = Arrangement.spacedBy(CARD_PADDING.dp),
        verticalArrangement = Arrangement.spacedBy(CARD_PADDING.dp)
    ) {
        items(
            items = products,
            key = { it.id }
        ) { product ->
            ProductCard(
                product = product,
                onClick = { onProductClick(product.id) },
                modifier = Modifier.animateItemPlacement()
            )
        }
    }
}

@Composable
private fun ProductCard(
    product: Product,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics { 
                contentDescription = "Product: ${product.name}"
            },
        shape = RoundedCornerShape(8.dp),
        onClick = onClick
    ) {
        Column(
            modifier = Modifier.padding(8.dp)
        ) {
            AsyncImage(
                model = product.images.firstOrNull(),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = product.name,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "$${product.price}",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
private fun LoadingPlaceholder() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ErrorState(
    error: String,
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

@Composable
private fun EmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "No products found",
            style = MaterialTheme.typography.bodyLarge
        )
    }
}
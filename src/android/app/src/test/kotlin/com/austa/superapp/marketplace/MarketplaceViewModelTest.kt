package com.austa.superapp.marketplace

import app.cash.turbine.test
import com.austa.superapp.common.ProductCategory
import com.austa.superapp.core.constants.AppConstants.UI
import com.austa.superapp.features.marketplace.data.MarketplaceRepository
import com.austa.superapp.features.marketplace.domain.models.Product
import com.austa.superapp.features.marketplace.domain.models.ProductDetails
import com.austa.superapp.features.marketplace.presentation.MarketplaceViewModel
import com.austa.superapp.features.marketplace.presentation.MarketplaceUiState
import io.mockk.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import java.io.IOException
import kotlin.time.Duration.Companion.milliseconds

@OptIn(ExperimentalCoroutinesApi::class)
class MarketplaceViewModelTest {

    private lateinit var mockRepository: MarketplaceRepository
    private lateinit var testDispatcher: TestDispatcher
    private lateinit var viewModel: MarketplaceViewModel

    private val testProducts = listOf(
        Product(
            id = "1",
            name = "Test Product",
            description = "Test Description",
            category = ProductCategory.WELLNESS,
            price = 99.99,
            providerId = "provider1",
            images = listOf("image1.jpg"),
            details = ProductDetails(
                duration = 60,
                format = "Online",
                prerequisites = listOf("None"),
                outcomes = listOf("Better health")
            ),
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis()
        )
    )

    @BeforeEach
    fun setup() {
        mockRepository = mockk(relaxed = true)
        testDispatcher = StandardTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        viewModel = MarketplaceViewModel(mockRepository)
    }

    @AfterEach
    fun cleanup() {
        clearAllMocks()
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state should be loading without products`() = runTest {
        viewModel.uiState.test {
            val initialState = awaitItem()
            assertTrue(initialState.isLoading)
            assertTrue(initialState.products.isEmpty())
            assertNull(initialState.error)
        }
    }

    @Test
    fun `loadProducts should update state with products on success`() = runTest {
        // Arrange
        coEvery { mockRepository.getProducts(any(), any(), any()) } returns 
            flowOf(Result.success(testProducts))

        // Act
        viewModel.loadProducts()
        advanceUntilIdle()

        // Assert
        viewModel.uiState.test {
            val state = awaitItem()
            assertFalse(state.isLoading)
            assertEquals(testProducts, state.products)
            assertNull(state.error)
            assertEquals(1, state.currentPage)
            assertTrue(state.hasMorePages)
        }
    }

    @Test
    fun `loadProducts should handle error states`() = runTest {
        // Arrange
        val error = IOException("Network error")
        coEvery { mockRepository.getProducts(any(), any(), any()) } returns 
            flowOf(Result.failure(error))

        // Act
        viewModel.loadProducts()
        advanceUntilIdle()

        // Assert
        viewModel.uiState.test {
            val state = awaitItem()
            assertFalse(state.isLoading)
            assertTrue(state.products.isEmpty())
            assertEquals("Network error. Please check your connection.", state.error)
        }
    }

    @Test
    fun `searchProducts should debounce multiple rapid searches`() = runTest {
        // Arrange
        coEvery { mockRepository.searchProducts(any(), any()) } returns 
            flowOf(Result.success(testProducts))

        // Act
        viewModel.searchProducts("test")
        viewModel.searchProducts("test1")
        viewModel.searchProducts("test2")
        advanceTimeBy(UI.DEBOUNCE_DELAY_MS + 100)
        advanceUntilIdle()

        // Assert
        coVerify(exactly = 1) { mockRepository.searchProducts(eq("test2"), any()) }
    }

    @Test
    fun `searchProducts should not trigger search for short queries`() = runTest {
        // Act
        viewModel.searchProducts("t")
        advanceUntilIdle()

        // Assert
        coVerify(exactly = 0) { mockRepository.searchProducts(any(), any()) }
        coVerify(exactly = 1) { mockRepository.getProducts(any(), any(), any()) }
    }

    @Test
    fun `refreshProducts should handle retry attempts on failure`() = runTest {
        // Arrange
        coEvery { mockRepository.refreshProducts() } returns Result.failure(IOException())
        coEvery { mockRepository.getProducts(any(), any(), any()) } returns 
            flowOf(Result.success(testProducts))

        // Act
        viewModel.refreshProducts()
        advanceUntilIdle()

        // Assert
        viewModel.uiState.test {
            val state = awaitItem()
            assertFalse(state.isRefreshing)
            assertNotNull(state.error)
        }
        coVerify(exactly = 3) { mockRepository.refreshProducts() }
    }

    @Test
    fun `filterProducts should apply category filter`() = runTest {
        // Arrange
        coEvery { mockRepository.getProducts(eq(ProductCategory.WELLNESS), any(), any()) } returns 
            flowOf(Result.success(testProducts))

        // Act
        viewModel.loadProducts(ProductCategory.WELLNESS)
        advanceUntilIdle()

        // Assert
        viewModel.uiState.test {
            val state = awaitItem()
            assertFalse(state.isLoading)
            assertEquals(testProducts, state.products)
            assertNull(state.error)
        }
        coVerify { mockRepository.getProducts(eq(ProductCategory.WELLNESS), any(), any()) }
    }

    @Test
    fun `pagination should load more products`() = runTest {
        // Arrange
        val page2Products = testProducts.map { it.copy(id = "2${it.id}") }
        coEvery { mockRepository.getProducts(any(), eq(1), any()) } returns 
            flowOf(Result.success(testProducts))
        coEvery { mockRepository.getProducts(any(), eq(2), any()) } returns 
            flowOf(Result.success(page2Products))

        // Act
        viewModel.loadProducts(page = 1)
        advanceUntilIdle()
        viewModel.loadProducts(page = 2)
        advanceUntilIdle()

        // Assert
        viewModel.uiState.test {
            val state = awaitItem()
            assertFalse(state.isLoading)
            assertEquals(testProducts + page2Products, state.products)
            assertEquals(2, state.currentPage)
        }
    }

    @Test
    fun `concurrent operations should be handled correctly`() = runTest {
        // Arrange
        coEvery { mockRepository.searchProducts(any(), any()) } coAnswers {
            delay(500)
            flowOf(Result.success(testProducts))
        }

        // Act
        viewModel.searchProducts("test1")
        advanceTimeBy(200)
        viewModel.searchProducts("test2")
        advanceTimeBy(UI.DEBOUNCE_DELAY_MS + 600)
        advanceUntilIdle()

        // Assert
        coVerify(exactly = 1) { mockRepository.searchProducts(eq("test2"), any()) }
    }
}
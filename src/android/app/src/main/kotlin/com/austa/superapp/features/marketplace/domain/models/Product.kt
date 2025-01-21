package com.austa.superapp.features.marketplace.domain.models

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.Index
import androidx.room.TypeConverters
import kotlinx.serialization.Serializable
import com.austa.superapp.common.ProductCategory

// kotlinx.serialization v1.5.1
// androidx.room v2.5.2

/**
 * Constants for product validation
 */
private const val MAX_NAME_LENGTH = 100
private const val MAX_DESCRIPTION_LENGTH = 1000
private const val MAX_IMAGES = 10
private const val MIN_PRICE = 0.0
private const val MAX_PREREQUISITES = 5
private const val MAX_OUTCOMES = 10
private const val MAX_FORMAT_LENGTH = 50

/**
 * Data class representing detailed product information with embedded persistence support.
 * Contains validation for format, prerequisites and outcomes.
 */
@Serializable
@Embedded
data class ProductDetails(
    val duration: Int,
    val format: String,
    val prerequisites: List<String>,
    val outcomes: List<String>
) {
    init {
        require(format.length <= MAX_FORMAT_LENGTH) {
            "Format length cannot exceed $MAX_FORMAT_LENGTH characters"
        }
        require(prerequisites.size <= MAX_PREREQUISITES) {
            "Prerequisites list cannot exceed $MAX_PREREQUISITES items"
        }
        require(outcomes.size <= MAX_OUTCOMES) {
            "Outcomes list cannot exceed $MAX_OUTCOMES items"
        }
    }
}

/**
 * Data class representing a marketplace product with comprehensive validation and persistence support.
 * Implements Room Entity for local storage and Serializable for API communication.
 */
@Serializable
@Entity(
    tableName = "products",
    indices = [Index(value = ["providerId"])]
)
@TypeConverters(ProductTypeConverters::class)
data class Product(
    val id: String,
    val name: String,
    val description: String,
    val category: ProductCategory,
    val price: Double,
    val providerId: String,
    val images: List<String>,
    val details: ProductDetails,
    val createdAt: Long,
    val updatedAt: Long
) {
    init {
        require(name.length <= MAX_NAME_LENGTH) {
            "Product name cannot exceed $MAX_NAME_LENGTH characters"
        }
        require(description.length <= MAX_DESCRIPTION_LENGTH) {
            "Product description cannot exceed $MAX_DESCRIPTION_LENGTH characters"
        }
        require(price >= MIN_PRICE) {
            "Product price cannot be negative"
        }
        require(images.size <= MAX_IMAGES) {
            "Product images cannot exceed $MAX_IMAGES items"
        }
        require(id.isNotBlank()) {
            "Product ID cannot be blank"
        }
        require(providerId.isNotBlank()) {
            "Provider ID cannot be blank"
        }
        require(createdAt > 0) {
            "Created timestamp must be positive"
        }
        require(updatedAt >= createdAt) {
            "Updated timestamp must be greater than or equal to created timestamp"
        }
    }
}
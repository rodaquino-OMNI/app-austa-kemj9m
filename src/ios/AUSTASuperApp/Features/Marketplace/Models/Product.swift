//
// Product.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // v14.0+

// MARK: - Constants

private let MAX_NAME_LENGTH = 100 // Maximum allowed length for product names
private let MAX_DESCRIPTION_LENGTH = 1000 // Maximum allowed length for product descriptions
private let MAX_IMAGES = 10 // Maximum number of product images allowed

// MARK: - Product Model

/// Core product model representing marketplace items with comprehensive validation and type safety
public struct Product: Codable, Identifiable, Hashable {
    /// Unique identifier for the product
    public let id: String
    
    /// Name of the product (max 100 characters)
    public let name: String
    
    /// Detailed description of the product (max 1000 characters)
    public let description: String
    
    /// Category classification of the product
    public let category: ProductCategory
    
    /// Price of the product in the marketplace
    public let price: Decimal
    
    /// Unique identifier of the provider offering the product
    public let providerId: String
    
    /// Array of image URLs associated with the product (max 10 images)
    public let images: [String]
    
    /// Additional details and specifications of the product
    public let details: ProductDetails
    
    // MARK: - Initialization
    
    public init(id: String, name: String, description: String, category: ProductCategory,
                price: Decimal, providerId: String, images: [String], details: ProductDetails) throws {
        // Validate input constraints
        guard name.count <= MAX_NAME_LENGTH else {
            throw ValidationError.nameTooLong
        }
        
        guard description.count <= MAX_DESCRIPTION_LENGTH else {
            throw ValidationError.descriptionTooLong
        }
        
        guard images.count <= MAX_IMAGES else {
            throw ValidationError.tooManyImages
        }
        
        guard price >= 0 else {
            throw ValidationError.invalidPrice
        }
        
        self.id = id
        self.name = name
        self.description = description
        self.category = category
        self.price = price
        self.providerId = providerId
        self.images = images
        self.details = details
    }
}

// MARK: - Product Details

/// Detailed product information structure with optional fields for flexibility
public struct ProductDetails: Codable, Hashable {
    /// Duration of the product/service in seconds (if applicable)
    public let duration: TimeInterval?
    
    /// List of features offered by the product
    public let features: [String]
    
    /// Optional list of requirements or prerequisites
    public let requirements: [String]?
    
    /// Current availability status of the product
    public let availability: ProductAvailability
    
    public init(duration: TimeInterval? = nil,
                features: [String],
                requirements: [String]? = nil,
                availability: ProductAvailability) {
        self.duration = duration
        self.features = features
        self.requirements = requirements
        self.availability = availability
    }
}

// MARK: - Product Category

/// Available product categories in the marketplace
public enum ProductCategory: String, Codable, CaseIterable, Hashable {
    case digitalTherapy = "digital_therapy"
    case wellnessProgram = "wellness_program"
    case providerService = "provider_service"
}

// MARK: - Product Availability

/// Product availability status
public enum ProductAvailability: String, Codable, Hashable {
    case available = "available"
    case comingSoon = "coming_soon"
    case limitedSpots = "limited_spots"
    case soldOut = "sold_out"
}

// MARK: - Validation Error

/// Enumeration of possible validation errors during product initialization
private enum ValidationError: Error {
    case nameTooLong
    case descriptionTooLong
    case tooManyImages
    case invalidPrice
}
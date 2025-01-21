//
// HealthMetric.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import HealthKit // Version: iOS 14.0+

/// Supported health metric types with FHIR R4 compliance
@objc public enum HealthMetricType: Int, RawRepresentable {
    case HEART_RATE
    case BLOOD_PRESSURE
    case BLOOD_GLUCOSE
    case TEMPERATURE
    case OXYGEN_SATURATION
    case STEPS
    case SLEEP_HOURS
    case RESPIRATORY_RATE
    case BODY_WEIGHT
    case BODY_MASS_INDEX
    
    public typealias RawValue = String
    
    public var rawValue: String {
        switch self {
        case .HEART_RATE: return "heart_rate"
        case .BLOOD_PRESSURE: return "blood_pressure"
        case .BLOOD_GLUCOSE: return "blood_glucose"
        case .TEMPERATURE: return "temperature"
        case .OXYGEN_SATURATION: return "oxygen_saturation"
        case .STEPS: return "steps"
        case .SLEEP_HOURS: return "sleep_hours"
        case .RESPIRATORY_RATE: return "respiratory_rate"
        case .BODY_WEIGHT: return "body_weight"
        case .BODY_MASS_INDEX: return "body_mass_index"
        }
    }
    
    public init?(rawValue: String) {
        switch rawValue {
        case "heart_rate": self = .HEART_RATE
        case "blood_pressure": self = .BLOOD_PRESSURE
        case "blood_glucose": self = .BLOOD_GLUCOSE
        case "temperature": self = .TEMPERATURE
        case "oxygen_saturation": self = .OXYGEN_SATURATION
        case "steps": self = .STEPS
        case "sleep_hours": self = .SLEEP_HOURS
        case "respiratory_rate": self = .RESPIRATORY_RATE
        case "body_weight": self = .BODY_WEIGHT
        case "body_mass_index": self = .BODY_MASS_INDEX
        default: return nil
        }
    }
}

/// Standardized units for health metrics based on FHIR specifications
private let METRIC_UNITS: [HealthMetricType: String] = [
    .HEART_RATE: "bpm",
    .BLOOD_PRESSURE: "mmHg",
    .BLOOD_GLUCOSE: "mg/dL",
    .TEMPERATURE: "°C",
    .OXYGEN_SATURATION: "%",
    .STEPS: "count",
    .SLEEP_HOURS: "hours",
    .RESPIRATORY_RATE: "breaths/min",
    .BODY_WEIGHT: "kg",
    .BODY_MASS_INDEX: "kg/m2"
]

/// FHIR R4 profiles for health metrics
private let FHIR_PROFILES: [HealthMetricType: String] = [
    .HEART_RATE: "http://hl7.org/fhir/StructureDefinition/vitalsigns",
    .BLOOD_PRESSURE: "http://hl7.org/fhir/StructureDefinition/bp",
    .BLOOD_GLUCOSE: "http://hl7.org/fhir/StructureDefinition/vitalsigns",
    .TEMPERATURE: "http://hl7.org/fhir/StructureDefinition/vitalsigns",
    .OXYGEN_SATURATION: "http://hl7.org/fhir/StructureDefinition/vitalsigns"
]

/// FHIR R4-compliant health metric model with comprehensive validation
@objc @objcMembers public class HealthMetric: NSObject {
    
    // MARK: - Properties
    
    public let id: UUID
    public let metricType: HealthMetricType
    public let value: Double
    public let unit: String
    public let timestamp: Date
    public let source: String?
    public private(set) var isNormal: Bool
    public private(set) var metadata: [String: Any]
    public let fhirProfile: String?
    public private(set) var fhirExtensions: [String: Any]
    
    private let validationCache: NSCache<NSString, NSNumber>
    
    // MARK: - Initialization
    
    public init(metricType: HealthMetricType,
               value: Double,
               source: String? = nil,
               fhirExtensions: [String: Any]? = nil) throws {
        
        // Generate cryptographically secure UUID
        self.id = UUID()
        
        // Validate and set metric type
        self.metricType = metricType
        
        // Set value and get standardized unit
        self.value = value
        self.unit = METRIC_UNITS[metricType] ?? ""
        
        // Set timestamp with precise timezone
        self.timestamp = Date()
        
        // Set optional source
        self.source = source
        
        // Initialize validation cache
        self.validationCache = NSCache<NSString, NSNumber>()
        
        // Set FHIR profile
        self.fhirProfile = FHIR_PROFILES[metricType]
        
        // Initialize FHIR extensions
        self.fhirExtensions = fhirExtensions ?? [:]
        
        // Initialize metadata with FHIR required elements
        self.metadata = [
            "resourceType": "Observation",
            "status": "final",
            "category": [
                ["coding": [
                    ["system": "http://terminology.hl7.org/CodeSystem/observation-category",
                     "code": "vital-signs",
                     "display": "Vital Signs"]
                ]]
            ],
            "effectiveDateTime": ISO8601DateFormatter().string(from: timestamp)
        ]
        
        // Initialize isNormal flag
        self.isNormal = false
        
        super.init()
        
        // Validate metric and update isNormal flag
        try validate()
        
        // Log metric creation for audit
        auditLog("metric_created", metadata: [
            "metric_type": metricType.rawValue,
            "source": source ?? "manual",
            "timestamp": timestamp.timeIntervalSince1970
        ])
    }
    
    // MARK: - Public Methods
    
    /// Creates a FHIR-compliant health metric from wearable data
    public class func fromWearableData(_ wearableData: WearableData) throws -> HealthMetric {
        // Extract metric type and value
        let metricType = try getMetricType(from: wearableData.deviceType)
        let value = wearableData.value
        
        // Create metric instance
        let metric = try HealthMetric(
            metricType: metricType,
            value: value,
            source: wearableData.deviceType,
            fhirExtensions: [
                "device": [
                    "identifier": wearableData.deviceType,
                    "display": "Wearable Device"
                ]
            ]
        )
        
        return metric
    }
    
    /// Converts health metric to HealthKit quantity with FHIR mapping
    public func toHealthKitQuantity() -> HKQuantity? {
        guard let unit = createHealthKitUnit() else { return nil }
        
        let quantity = HKQuantity(unit: unit, doubleValue: value)
        
        // Log conversion for audit
        auditLog("converted_to_healthkit", metadata: [
            "metric_type": metricType.rawValue,
            "unit": self.unit
        ])
        
        return quantity
    }
    
    /// Performs comprehensive validation including FHIR compliance
    public func validate() throws {
        // Check validation cache
        let cacheKey = NSString(string: "\(id.uuidString)_validation")
        if let cachedResult = validationCache.object(forKey: cacheKey) {
            isNormal = cachedResult.boolValue
            return
        }
        
        // Validate metric type and unit
        guard let expectedUnit = METRIC_UNITS[metricType] else {
            throw ServiceError.dataValidationError
        }
        
        guard unit == expectedUnit else {
            throw ServiceError.dataValidationError
        }
        
        // Validate value range
        let isValueValid = try ValidationUtils.validateMetricRange(
            value,
            type: metricType.rawValue
        )
        
        // Validate FHIR compliance
        let isFHIRCompliant = try ValidationUtils.validateFHIRCompliance(
            metadata,
            profile: fhirProfile ?? ""
        )
        
        isNormal = isValueValid && isFHIRCompliant
        
        // Cache validation result
        validationCache.setObject(NSNumber(value: isNormal), forKey: cacheKey)
        
        // Log validation
        auditLog("metric_validated", metadata: [
            "metric_type": metricType.rawValue,
            "is_normal": isNormal,
            "is_fhir_compliant": isFHIRCompliant
        ])
    }
    
    // MARK: - Private Methods
    
    private class func getMetricType(from deviceType: String) throws -> HealthMetricType {
        // Map device type to metric type
        let mappings = [
            "heartrate": HealthMetricType.HEART_RATE,
            "bloodpressure": HealthMetricType.BLOOD_PRESSURE,
            "glucose": HealthMetricType.BLOOD_GLUCOSE,
            "temperature": HealthMetricType.TEMPERATURE,
            "oximeter": HealthMetricType.OXYGEN_SATURATION
        ]
        
        guard let metricType = mappings[deviceType.lowercased()] else {
            throw ServiceError.invalidInput("Unsupported device type")
        }
        
        return metricType
    }
    
    private func createHealthKitUnit() -> HKUnit? {
        switch metricType {
        case .HEART_RATE:
            return HKUnit.count().unitDivided(by: .minute())
        case .BLOOD_PRESSURE:
            return HKUnit.millimeterOfMercury()
        case .BLOOD_GLUCOSE:
            return HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci))
        case .TEMPERATURE:
            return HKUnit.degreeCelsius()
        case .OXYGEN_SATURATION:
            return HKUnit.percent()
        default:
            return nil
        }
    }
    
    private func auditLog(_ action: String, metadata: [String: Any]?) {
        var auditMetadata = metadata ?? [:]
        auditMetadata["metric_id"] = id.uuidString
        auditMetadata["action"] = action
        
        if AppConstants.Features.ENABLE_ANALYTICS {
            // Implementation of audit logging
        }
    }
}
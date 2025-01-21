// Foundation - iOS 14.0+
import Foundation
// HealthKit - iOS 14.0+
import HealthKit

/// Set of supported HealthKit metric types for wearable data collection
private let METRIC_TYPES: Set<HKQuantityType> = [
    HKQuantityType.quantityType(forIdentifier: .heartRate)!,
    HKQuantityType.quantityType(forIdentifier: .stepCount)!,
    HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic)!,
    HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic)!,
    HKQuantityType.quantityType(forIdentifier: .oxygenSaturation)!
]

/// Cache for storing converted HealthKit samples
private let METRIC_CACHE = NSCache<NSString, HKSample>()

/// Valid ranges for health metrics based on medical standards
private let VALID_RANGES: [HKQuantityType: ClosedRange<Double>] = [
    HKQuantityType.quantityType(forIdentifier: .heartRate)!: 30...220,
    HKQuantityType.quantityType(forIdentifier: .stepCount)!: 0...100000,
    HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic)!: 70...200,
    HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic)!: 40...130,
    HKQuantityType.quantityType(forIdentifier: .oxygenSaturation)!: 80...100
]

/// Errors that can occur during wearable data operations
enum WearableDataError: Error {
    case invalidMetricValue(String)
    case conversionFailed(String)
    case healthKitError(Error)
    case fhirConversionError(String)
    case cacheMiss(String)
}

@available(iOS 14.0, *)
@objc public class WearableData: NSObject {
    
    // MARK: - Properties
    
    public let id: UUID
    public let timestamp: Date
    public let heartRate: Double?
    public let stepCount: Int?
    public let bloodPressureSystolic: Double?
    public let bloodPressureDiastolic: Double?
    public let oxygenSaturation: Double?
    public let deviceIdentifier: String
    public let deviceModel: String
    
    private let metricCache: NSCache<NSString, HKSample>
    
    // MARK: - Initialization
    
    public init(
        id: UUID = UUID(),
        timestamp: Date,
        heartRate: Double? = nil,
        stepCount: Int? = nil,
        bloodPressureSystolic: Double? = nil,
        bloodPressureDiastolic: Double? = nil,
        oxygenSaturation: Double? = nil,
        deviceIdentifier: String,
        deviceModel: String
    ) throws {
        self.id = id
        self.timestamp = timestamp
        self.heartRate = heartRate
        self.stepCount = stepCount
        self.bloodPressureSystolic = bloodPressureSystolic
        self.bloodPressureDiastolic = bloodPressureDiastolic
        self.oxygenSaturation = oxygenSaturation
        self.deviceIdentifier = deviceIdentifier
        self.deviceModel = deviceModel
        self.metricCache = NSCache<NSString, HKSample>()
        
        super.init()
        
        try validateMetrics()
    }
    
    // MARK: - Public Methods
    
    /// Converts WearableData to HealthKit samples with caching
    public func toHealthKit() -> Result<[HKSample], Error> {
        do {
            var samples: [HKSample] = []
            
            // Convert heart rate if available
            if let heartRate = heartRate {
                let sample = try createHealthKitSample(
                    type: .heartRate,
                    value: heartRate,
                    unit: HKUnit.count().unitDivided(by: .minute())
                )
                samples.append(sample)
            }
            
            // Convert step count if available
            if let stepCount = stepCount {
                let sample = try createHealthKitSample(
                    type: .stepCount,
                    value: Double(stepCount),
                    unit: HKUnit.count()
                )
                samples.append(sample)
            }
            
            // Convert blood pressure if available
            if let systolic = bloodPressureSystolic,
               let diastolic = bloodPressureDiastolic {
                let systolicSample = try createHealthKitSample(
                    type: .bloodPressureSystolic,
                    value: systolic,
                    unit: HKUnit.millimeterOfMercury()
                )
                let diastolicSample = try createHealthKitSample(
                    type: .bloodPressureDiastolic,
                    value: diastolic,
                    unit: HKUnit.millimeterOfMercury()
                )
                samples.append(contentsOf: [systolicSample, diastolicSample])
            }
            
            // Convert oxygen saturation if available
            if let oxygenSaturation = oxygenSaturation {
                let sample = try createHealthKitSample(
                    type: .oxygenSaturation,
                    value: oxygenSaturation / 100.0, // Convert to percentage
                    unit: HKUnit.percent()
                )
                samples.append(sample)
            }
            
            return .success(samples)
        } catch {
            return .failure(WearableDataError.healthKitError(error))
        }
    }
    
    /// Creates WearableData from HealthKit samples
    public static func fromHealthKit(_ samples: [HKSample]) -> Result<WearableData, Error> {
        do {
            var heartRate: Double?
            var stepCount: Int?
            var systolic: Double?
            var diastolic: Double?
            var oxygenSaturation: Double?
            var deviceInfo: (String, String)?
            
            for sample in samples {
                guard let quantitySample = sample as? HKQuantitySample else { continue }
                
                switch quantitySample.quantityType {
                case HKQuantityType.quantityType(forIdentifier: .heartRate):
                    heartRate = quantitySample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                case HKQuantityType.quantityType(forIdentifier: .stepCount):
                    stepCount = Int(quantitySample.quantity.doubleValue(for: HKUnit.count()))
                case HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic):
                    systolic = quantitySample.quantity.doubleValue(for: HKUnit.millimeterOfMercury())
                case HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic):
                    diastolic = quantitySample.quantity.doubleValue(for: HKUnit.millimeterOfMercury())
                case HKQuantityType.quantityType(forIdentifier: .oxygenSaturation):
                    oxygenSaturation = quantitySample.quantity.doubleValue(for: HKUnit.percent()) * 100.0
                default:
                    continue
                }
                
                if deviceInfo == nil {
                    deviceInfo = (
                        quantitySample.device?.identifier ?? "unknown",
                        quantitySample.device?.model ?? "unknown"
                    )
                }
            }
            
            let wearableData = try WearableData(
                timestamp: samples.first?.startDate ?? Date(),
                heartRate: heartRate,
                stepCount: stepCount,
                bloodPressureSystolic: systolic,
                bloodPressureDiastolic: diastolic,
                oxygenSaturation: oxygenSaturation,
                deviceIdentifier: deviceInfo?.0 ?? "unknown",
                deviceModel: deviceInfo?.1 ?? "unknown"
            )
            
            return .success(wearableData)
        } catch {
            return .failure(error)
        }
    }
    
    /// Converts WearableData to FHIR Observation resource
    public func toFHIR() -> Result<Data, Error> {
        do {
            let fhirObservation: [String: Any] = [
                "resourceType": "Observation",
                "id": id.uuidString,
                "status": "final",
                "category": [
                    ["coding": [
                        ["system": "http://terminology.hl7.org/CodeSystem/observation-category",
                         "code": "vital-signs",
                         "display": "Vital Signs"]
                    ]]
                ],
                "effectiveDateTime": ISO8601DateFormatter().string(from: timestamp),
                "device": [
                    "identifier": [
                        "system": "urn:ietf:rfc:3986",
                        "value": deviceIdentifier
                    ],
                    "display": deviceModel
                ],
                "component": createFHIRComponents()
            ]
            
            return .success(try JSONSerialization.data(withJSONObject: fhirObservation))
        } catch {
            return .failure(WearableDataError.fhirConversionError(error.localizedDescription))
        }
    }
    
    // MARK: - Private Methods
    
    private func validateMetrics() throws {
        if let heartRate = heartRate,
           !VALID_RANGES[METRIC_TYPES.first(where: { $0.identifier == HKQuantityTypeIdentifier.heartRate.rawValue })!]!.contains(heartRate) {
            throw WearableDataError.invalidMetricValue("Heart rate out of valid range")
        }
        
        if let stepCount = stepCount,
           !VALID_RANGES[METRIC_TYPES.first(where: { $0.identifier == HKQuantityTypeIdentifier.stepCount.rawValue })!]!.contains(Double(stepCount)) {
            throw WearableDataError.invalidMetricValue("Step count out of valid range")
        }
        
        if let systolic = bloodPressureSystolic,
           !VALID_RANGES[METRIC_TYPES.first(where: { $0.identifier == HKQuantityTypeIdentifier.bloodPressureSystolic.rawValue })!]!.contains(systolic) {
            throw WearableDataError.invalidMetricValue("Systolic pressure out of valid range")
        }
        
        if let diastolic = bloodPressureDiastolic,
           !VALID_RANGES[METRIC_TYPES.first(where: { $0.identifier == HKQuantityTypeIdentifier.bloodPressureDiastolic.rawValue })!]!.contains(diastolic) {
            throw WearableDataError.invalidMetricValue("Diastolic pressure out of valid range")
        }
        
        if let oxygenSaturation = oxygenSaturation,
           !VALID_RANGES[METRIC_TYPES.first(where: { $0.identifier == HKQuantityTypeIdentifier.oxygenSaturation.rawValue })!]!.contains(oxygenSaturation) {
            throw WearableDataError.invalidMetricValue("Oxygen saturation out of valid range")
        }
    }
    
    private func createHealthKitSample(type: HKQuantityTypeIdentifier, value: Double, unit: HKUnit) throws -> HKSample {
        guard let quantityType = HKQuantityType.quantityType(forIdentifier: type) else {
            throw WearableDataError.conversionFailed("Invalid quantity type")
        }
        
        let quantity = HKQuantity(unit: unit, doubleValue: value)
        let metadata: [String: Any] = [
            HKMetadataKeyDeviceName: deviceModel,
            HKMetadataKeyDeviceManufacturerName: deviceIdentifier
        ]
        
        return HKQuantitySample(
            type: quantityType,
            quantity: quantity,
            start: timestamp,
            end: timestamp,
            metadata: metadata
        )
    }
    
    private func createFHIRComponents() -> [[String: Any]] {
        var components: [[String: Any]] = []
        
        if let heartRate = heartRate {
            components.append([
                "code": ["coding": [["system": "http://loinc.org", "code": "8867-4", "display": "Heart rate"]]],
                "valueQuantity": ["value": heartRate, "unit": "beats/minute", "system": "http://unitsofmeasure.org", "code": "/min"]
            ])
        }
        
        if let stepCount = stepCount {
            components.append([
                "code": ["coding": [["system": "http://loinc.org", "code": "55423-8", "display": "Number of steps"]]],
                "valueQuantity": ["value": stepCount, "unit": "steps", "system": "http://unitsofmeasure.org", "code": "{steps}"]
            ])
        }
        
        if let systolic = bloodPressureSystolic, let diastolic = bloodPressureDiastolic {
            components.append(contentsOf: [
                [
                    "code": ["coding": [["system": "http://loinc.org", "code": "8480-6", "display": "Systolic blood pressure"]]],
                    "valueQuantity": ["value": systolic, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]"]
                ],
                [
                    "code": ["coding": [["system": "http://loinc.org", "code": "8462-4", "display": "Diastolic blood pressure"]]],
                    "valueQuantity": ["value": diastolic, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]"]
                ]
            ])
        }
        
        if let oxygenSaturation = oxygenSaturation {
            components.append([
                "code": ["coding": [["system": "http://loinc.org", "code": "59408-5", "display": "Oxygen saturation"]]],
                "valueQuantity": ["value": oxygenSaturation, "unit": "%", "system": "http://unitsofmeasure.org", "code": "%"]
            ])
        }
        
        return components
    }
}
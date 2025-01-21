package com.austa.superapp.features.wearables.domain.models

import kotlinx.serialization.Serializable // v1.5.1
import java.time.Instant // kotlin.time v1.9.0
import kotlin.ranges.ClosedRange

/**
 * Represents health metrics collected from wearable devices with FHIR compliance.
 * Implements comprehensive validation and security measures for health data integration.
 */
@Serializable
data class WearableData(
    val id: String,
    val deviceId: String,
    val userId: String,
    val type: WearableType,
    val timestamp: Instant,
    val metrics: Map<String, Double>,
    val metadata: WearableMetadata,
    val isCalibrated: Boolean,
    val fhirMappings: Map<String, String>
) {
    init {
        require(id.isNotBlank()) { "ID must not be blank" }
        require(deviceId.matches(Regex("^[A-Za-z0-9-_]{8,32}$"))) { 
            "Device ID must be alphanumeric, 8-32 characters" 
        }
        require(userId.isNotBlank()) { "User ID must not be blank" }
        require(!timestamp.isAfter(Instant.now())) { 
            "Timestamp cannot be in the future" 
        }
        require(metrics.isNotEmpty()) { "Metrics cannot be empty" }
        validateMetrics()
    }

    /**
     * Validates metric values against defined medical ranges
     */
    private fun validateMetrics() {
        metrics.forEach { (key, value) ->
            metadata.metricRanges[key]?.let { range ->
                require(value in range) {
                    "Metric $key value $value is outside valid range ${range.start}..${range.endInclusive}"
                }
            }
        }
    }

    /**
     * Converts wearable data to FHIR-compliant health record format
     * @return HealthRecord object conforming to FHIR R4 specification
     */
    fun toHealthRecord(): HealthRecord {
        validateFhirMappings()
        return HealthRecord(
            identifier = id,
            subject = userId,
            device = createDeviceResource(),
            observations = createObservations(),
            timestamp = timestamp,
            metadata = createFhirMetadata()
        )
    }

    /**
     * Performs comprehensive validation of wearable data
     * @return Boolean indicating if data meets all validation criteria
     */
    fun isValid(): Boolean {
        return try {
            validateDeviceId()
            validateTimestamp()
            validateMetrics()
            validateFhirMappings()
            validateMetadata()
            true
        } catch (e: IllegalArgumentException) {
            false
        }
    }

    private fun validateDeviceId() {
        require(deviceId.matches(Regex("^[A-Za-z0-9-_]{8,32}$")))
    }

    private fun validateTimestamp() {
        require(!timestamp.isAfter(Instant.now()))
    }

    private fun validateFhirMappings() {
        require(fhirMappings.isNotEmpty()) { "FHIR mappings cannot be empty" }
        metrics.keys.forEach { metric ->
            require(fhirMappings.containsKey(metric)) {
                "Missing FHIR mapping for metric: $metric"
            }
        }
    }

    private fun validateMetadata() {
        require(metadata.manufacturer.isNotBlank())
        require(metadata.model.isNotBlank())
        require(metadata.firmwareVersion.isNotBlank())
        require(metadata.batteryLevel in 0.0..100.0)
    }

    private fun createDeviceResource(): DeviceResource {
        return DeviceResource(
            identifier = deviceId,
            type = type,
            manufacturer = metadata.manufacturer,
            model = metadata.model,
            version = metadata.firmwareVersion,
            capabilities = metadata.capabilities
        )
    }

    private fun createObservations(): List<Observation> {
        return metrics.map { (metric, value) ->
            Observation(
                code = fhirMappings[metric] ?: error("Missing FHIR mapping"),
                value = value,
                unit = metadata.metricRanges[metric]?.let { "units" }, // Replace with actual units
                timestamp = timestamp,
                deviceId = deviceId
            )
        }
    }

    private fun createFhirMetadata(): FhirMetadata {
        return FhirMetadata(
            isCalibrated = isCalibrated,
            lastCalibration = metadata.lastCalibrationDate,
            certifications = metadata.certifications,
            deviceType = type.name
        )
    }
}

/**
 * Defines supported wearable device types with metadata
 */
@Serializable
enum class WearableType {
    SMARTWATCH,
    FITNESS_TRACKER,
    MEDICAL_DEVICE,
    HEALTH_MONITOR,
    CONTINUOUS_GLUCOSE_MONITOR
}

/**
 * Enhanced metadata about the wearable device including capabilities and certifications
 */
@Serializable
data class WearableMetadata(
    val manufacturer: String,
    val model: String,
    val firmwareVersion: String,
    val capabilities: Map<String, String>,
    val batteryLevel: Double,
    val isCalibrated: Boolean,
    val lastCalibrationDate: String,
    val certifications: Map<String, String>,
    val metricRanges: Map<String, ClosedRange<Double>>
) {
    init {
        require(manufacturer.isNotBlank()) { "Manufacturer must not be blank" }
        require(model.isNotBlank()) { "Model must not be blank" }
        require(firmwareVersion.isNotBlank()) { "Firmware version must not be blank" }
        require(batteryLevel in 0.0..100.0) { "Battery level must be between 0 and 100" }
        require(lastCalibrationDate.isNotBlank()) { "Last calibration date must not be blank" }
    }
}
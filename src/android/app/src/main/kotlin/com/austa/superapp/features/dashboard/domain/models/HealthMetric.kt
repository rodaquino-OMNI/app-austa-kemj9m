package com.austa.superapp.features.dashboard.domain.models

import android.os.Parcelable
import java.util.UUID
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.parcelize.Parcelize
import com.austa.superapp.core.utils.ValidationUtils
import com.austa.superapp.core.constants.AppConstants

/**
 * Represents device data from wearables and medical devices with comprehensive metadata support.
 * Implements FHIR Device resource compatibility.
 */
@Serializable
data class DeviceData(
    val deviceId: String,
    val deviceType: String,
    val manufacturer: String,
    val deviceMetadata: Map<String, String> = mapOf()
)

/**
 * Represents a health measurement or vital sign with FHIR compliance.
 * Implements comprehensive validation and device integration support.
 */
@Serializable
@Parcelize
data class HealthMetric(
    val id: String = UUID.randomUUID().toString(),
    val metricType: String,
    val value: Double,
    val unit: String,
    val timestamp: Instant = Instant.now(),
    val deviceData: DeviceData? = null,
    var isNormal: Boolean = true,
    val metadata: Map<String, Any> = mutableMapOf()
) : Parcelable {

    companion object {
        private val METRIC_TYPES = setOf(
            "HEART_RATE", "BLOOD_PRESSURE", "BLOOD_GLUCOSE",
            "TEMPERATURE", "OXYGEN_SATURATION", "STEPS", "SLEEP_HOURS"
        )

        private val METRIC_UNITS = mapOf(
            "HEART_RATE" to "bpm",
            "BLOOD_PRESSURE" to "mmHg",
            "BLOOD_GLUCOSE" to "mg/dL",
            "TEMPERATURE" to "°C",
            "OXYGEN_SATURATION" to "%",
            "STEPS" to "count",
            "SLEEP_HOURS" to "hours"
        )

        private val METRIC_RANGES = mapOf(
            "HEART_RATE" to Pair(30.0, 200.0),
            "BLOOD_PRESSURE" to Pair(60.0, 200.0),
            "BLOOD_GLUCOSE" to Pair(30.0, 500.0),
            "TEMPERATURE" to Pair(35.0, 42.0),
            "OXYGEN_SATURATION" to Pair(70.0, 100.0),
            "STEPS" to Pair(0.0, 100000.0),
            "SLEEP_HOURS" to Pair(0.0, 24.0)
        )
    }

    /**
     * Secondary constructor for creating HealthMetric with validation
     */
    constructor(
        metricType: String,
        value: Double,
        deviceData: DeviceData? = null
    ) : this(
        id = UUID.randomUUID().toString(),
        metricType = metricType.uppercase(),
        value = value,
        unit = METRIC_UNITS[metricType.uppercase()] ?: throw IllegalArgumentException("Invalid metric type"),
        timestamp = Instant.now(),
        deviceData = deviceData,
        isNormal = true,
        metadata = mutableMapOf()
    ) {
        require(validate()) { "Invalid health metric data" }
    }

    /**
     * Validates the health metric data with enhanced range checking and FHIR compliance
     */
    fun validate(): Boolean {
        if (!METRIC_TYPES.contains(metricType)) {
            return false
        }

        val range = METRIC_RANGES[metricType] ?: return false
        isNormal = ValidationUtils.validateMetricRange(value, range.first, range.second)

        if (timestamp.isAfter(Instant.now())) {
            return false
        }

        // Validate device data if present
        deviceData?.let {
            if (it.deviceId.isBlank() || it.deviceType.isBlank() || it.manufacturer.isBlank()) {
                return false
            }
        }

        return true
    }

    /**
     * Converts the health metric to FHIR R4 Observation format
     */
    fun toFhirObservation(): String {
        val fhirObservation = buildMap<String, Any> {
            put("resourceType", "Observation")
            put("id", id)
            put("status", "final")
            put("code", mapOf(
                "coding" to listOf(
                    mapOf(
                        "system" to "http://loinc.org",
                        "code" to when(metricType) {
                            "HEART_RATE" -> "8867-4"
                            "BLOOD_PRESSURE" -> "85354-9"
                            "BLOOD_GLUCOSE" -> "2339-0"
                            "TEMPERATURE" -> "8310-5"
                            "OXYGEN_SATURATION" -> "2708-6"
                            "STEPS" -> "55423-8"
                            "SLEEP_HOURS" -> "93832-4"
                            else -> throw IllegalStateException("Invalid metric type")
                        }
                    )
                )
            ))
            put("effectiveDateTime", timestamp.toString())
            put("valueQuantity", mapOf(
                "value" to value,
                "unit" to unit,
                "system" to "http://unitsofmeasure.org"
            ))

            deviceData?.let {
                put("device", mapOf(
                    "identifier" to mapOf(
                        "system" to "urn:ietf:rfc:3986",
                        "value" to it.deviceId
                    ),
                    "type" to mapOf(
                        "text" to it.deviceType
                    ),
                    "manufacturer" to it.manufacturer,
                    "metadata" to it.deviceMetadata
                ))
            }

            put("metadata", metadata)
        }

        return kotlinx.serialization.json.Json.encodeToString(
            kotlinx.serialization.json.JsonObject.serializer(),
            kotlinx.serialization.json.Json.encodeToJsonElement(fhirObservation) as kotlinx.serialization.json.JsonObject
        )
    }
}
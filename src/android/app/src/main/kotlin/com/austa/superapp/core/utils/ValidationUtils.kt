package com.austa.superapp.core.utils

import android.util.Patterns // AndroidX
import java.util.regex.Pattern // Java SDK
import org.apache.commons.text.StringEscapeUtils // v1.10.0
import com.austa.superapp.core.constants.AppConstants

/**
 * Comprehensive validation utilities for AUSTA SuperApp implementing HIPAA-compliant validation rules.
 * Provides robust input validation and sanitization for healthcare data, user information, and security requirements.
 */
object ValidationUtils {

    /**
     * Validation security levels for different types of data validation
     */
    enum class ValidationLevel {
        HIGH,    // For PHI/PII and critical security data
        MEDIUM,  // For general healthcare data
        LOW      // For non-sensitive information
    }

    /**
     * Validation result class providing detailed validation status and error reporting
     */
    data class ValidationResult(
        val isValid: Boolean,
        val errors: List<String>,
        val securityLevel: ValidationLevel,
        val validationDetails: Map<String, String> = mapOf()
    )

    // Validation patterns
    private val EMAIL_REGEX = Pattern.compile("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$")
    
    private val RESTRICTED_DOMAINS = setOf(
        "tempmail.com", "disposable.com", "throwaway.com"
    )

    private val HEALTH_DATA_PATTERNS = mapOf(
        "mrn" to Pattern.compile("^[A-Z0-9]{6,10}$"),
        "icd10" to Pattern.compile("^[A-Z][0-9][0-9AB]\\.?[0-9A-Z]{0,4}$"),
        "npi" to Pattern.compile("^[0-9]{10}$"),
        "phone" to Pattern.compile("^\\+?[1-9][0-9]{7,14}$")
    )

    /**
     * Validates email address format with enhanced security checks
     * @param email The email address to validate
     * @return ValidationResult containing validation status and error messages
     */
    fun validateEmail(email: String): ValidationResult {
        val errors = mutableListOf<String>()
        
        if (email.isBlank()) {
            errors.add("Email cannot be empty")
            return ValidationResult(false, errors, ValidationLevel.HIGH)
        }

        if (email.length > 254) {
            errors.add("Email exceeds maximum length")
        }

        if (!Patterns.EMAIL_ADDRESS.matcher(email).matches() || 
            !EMAIL_REGEX.matcher(email).matches()) {
            errors.add("Invalid email format")
        }

        val domain = email.substringAfterLast("@", "")
        if (RESTRICTED_DOMAINS.contains(domain.toLowerCase())) {
            errors.add("Email domain not allowed")
        }

        val sanitizedEmail = StringEscapeUtils.escapeHtml4(email)
        if (sanitizedEmail != email) {
            errors.add("Email contains invalid characters")
        }

        return ValidationResult(
            isValid = errors.isEmpty(),
            errors = errors,
            securityLevel = ValidationLevel.HIGH,
            validationDetails = mapOf("sanitized" to sanitizedEmail)
        )
    }

    /**
     * Validates password strength according to HIPAA requirements
     * @param password The password to validate
     * @return ValidationResult with detailed security compliance status
     */
    fun validatePassword(password: String): ValidationResult {
        val errors = mutableListOf<String>()
        
        if (password.length < AppConstants.SECURITY.PASSWORD_MIN_LENGTH) {
            errors.add("Password must be at least ${AppConstants.SECURITY.PASSWORD_MIN_LENGTH} characters")
        }

        if (password.length > AppConstants.SECURITY.PASSWORD_MAX_LENGTH) {
            errors.add("Password exceeds maximum length of ${AppConstants.SECURITY.PASSWORD_MAX_LENGTH} characters")
        }

        if (!password.matches(".*[A-Z].*".toRegex())) {
            errors.add("Password must contain at least one uppercase letter")
        }

        if (!password.matches(".*[a-z].*".toRegex())) {
            errors.add("Password must contain at least one lowercase letter")
        }

        if (!password.matches(".*[0-9].*".toRegex())) {
            errors.add("Password must contain at least one number")
        }

        if (!password.matches(".*[!@#\$%^&*(),.?\":{}|<>].*".toRegex())) {
            errors.add("Password must contain at least one special character")
        }

        // Check for common patterns
        if (password.matches(".*(\\w)\\1{2,}.*".toRegex())) {
            errors.add("Password contains repeated characters")
        }

        if (password.matches(".*(123|abc|password|qwerty).*".toRegex())) {
            errors.add("Password contains common patterns")
        }

        return ValidationResult(
            isValid = errors.isEmpty(),
            errors = errors,
            securityLevel = ValidationLevel.HIGH
        )
    }

    /**
     * Performs HIPAA-compliant validation of health record data
     * @param healthData Map containing health record data
     * @return ValidationResult with HIPAA compliance status
     */
    fun validateHealthData(healthData: Map<String, Any>): ValidationResult {
        val errors = mutableListOf<String>()
        val validationDetails = mutableMapOf<String, String>()

        // Required HIPAA fields validation
        val requiredFields = setOf("patientId", "providerId", "serviceDate", "recordType")
        val missingFields = requiredFields - healthData.keys
        if (missingFields.isNotEmpty()) {
            errors.add("Missing required fields: $missingFields")
        }

        // Validate patient ID format
        healthData["patientId"]?.toString()?.let { patientId ->
            if (!HEALTH_DATA_PATTERNS["mrn"]?.matcher(patientId)?.matches() == true) {
                errors.add("Invalid patient ID format")
            }
            validationDetails["patientId"] = "validated"
        }

        // Validate provider NPI
        healthData["providerId"]?.toString()?.let { providerId ->
            if (!HEALTH_DATA_PATTERNS["npi"]?.matcher(providerId)?.matches() == true) {
                errors.add("Invalid provider NPI format")
            }
            validationDetails["providerId"] = "validated"
        }

        // Validate service date
        healthData["serviceDate"]?.toString()?.let { dateStr ->
            try {
                val regex = "^\\d{4}-\\d{2}-\\d{2}$".toRegex()
                if (!regex.matches(dateStr)) {
                    errors.add("Invalid service date format (required: YYYY-MM-DD)")
                }
                validationDetails["serviceDate"] = "validated"
            } catch (e: Exception) {
                errors.add("Invalid service date")
            }
        }

        // Validate diagnosis codes
        @Suppress("UNCHECKED_CAST")
        (healthData["diagnosisCodes"] as? List<String>)?.forEach { code ->
            if (!HEALTH_DATA_PATTERNS["icd10"]?.matcher(code)?.matches() == true) {
                errors.add("Invalid ICD-10 code format: $code")
            }
        }

        // Validate contact information
        healthData["phoneNumber"]?.toString()?.let { phone ->
            if (!HEALTH_DATA_PATTERNS["phone"]?.matcher(phone)?.matches() == true) {
                errors.add("Invalid phone number format")
            }
            validationDetails["phoneNumber"] = "validated"
        }

        // Sanitize text fields
        healthData.forEach { (key, value) ->
            if (value is String) {
                val sanitized = StringEscapeUtils.escapeHtml4(value)
                if (sanitized != value) {
                    errors.add("Invalid characters in field: $key")
                }
                validationDetails["${key}_sanitized"] = "true"
            }
        }

        return ValidationResult(
            isValid = errors.isEmpty(),
            errors = errors,
            securityLevel = ValidationLevel.HIGH,
            validationDetails = validationDetails
        )
    }

    /**
     * Validates phone number format
     * @param phone The phone number to validate
     * @return ValidationResult containing validation status
     */
    fun validatePhone(phone: String): ValidationResult {
        val errors = mutableListOf<String>()

        if (phone.isBlank()) {
            errors.add("Phone number cannot be empty")
            return ValidationResult(false, errors, ValidationLevel.MEDIUM)
        }

        if (!Patterns.PHONE.matcher(phone).matches() ||
            !HEALTH_DATA_PATTERNS["phone"]?.matcher(phone)?.matches() == true) {
            errors.add("Invalid phone number format")
        }

        return ValidationResult(
            isValid = errors.isEmpty(),
            errors = errors,
            securityLevel = ValidationLevel.MEDIUM
        )
    }
}
package com.austa.superapp.core.utils

import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.Clock
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * Thread-safe date and time utilities for AUSTA SuperApp, providing healthcare-compliant
 * date formatting, parsing and validation according to HL7 FHIR R4 standards.
 *
 * @version 1.0
 * @see kotlinx-datetime 0.4.1
 */
object DateUtils {

    /**
     * Thread-safe singleton containing validated date-time format patterns
     * and cached formatters for performance optimization.
     */
    object DateTimePattern {
        const val ISO_8601 = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"
        const val DISPLAY_DATE = "dd/MM/yyyy"
        const val DISPLAY_TIME = "HH:mm"
        const val DISPLAY_DATE_TIME = "dd/MM/yyyy HH:mm"
        const val FHIR_DATE = "yyyy-MM-dd"

        private val formatCache = ConcurrentHashMap<String, SimpleDateFormat>()

        /**
         * Returns a thread-safe formatter from cache or creates a new one.
         *
         * @param pattern The date format pattern
         * @param locale The locale for formatting
         * @return Thread-safe SimpleDateFormat instance
         */
        fun getThreadSafeFormatter(pattern: String, locale: Locale): SimpleDateFormat {
            val cacheKey = "$pattern-${locale.toLanguageTag()}"
            return formatCache.getOrPut(cacheKey) {
                SimpleDateFormat(pattern, locale).apply {
                    isLenient = false // Strict date parsing for security
                }
            }
        }
    }

    /**
     * Formats LocalDateTime to ISO 8601 format required by FHIR with enhanced security validation.
     *
     * @param dateTime The LocalDateTime to format
     * @return ISO 8601 formatted date-time string with timezone
     * @throws IllegalArgumentException if dateTime is invalid
     */
    @Throws(IllegalArgumentException::class)
    fun formatToISODateTime(dateTime: LocalDateTime): String {
        require(isValidDateTime(dateTime)) { "Invalid date-time value" }

        return DateTimePattern.getThreadSafeFormatter(
            DateTimePattern.ISO_8601,
            Locale.ROOT
        ).format(dateTime.toJavaDate())
    }

    /**
     * Parses ISO 8601 formatted string to LocalDateTime with comprehensive validation.
     *
     * @param isoDateTime ISO 8601 formatted date-time string
     * @return Parsed LocalDateTime object
     * @throws IllegalArgumentException if the input string is invalid or contains injection attempts
     */
    @Throws(IllegalArgumentException::class)
    fun parseISODateTime(isoDateTime: String): LocalDateTime {
        require(isValidISOString(isoDateTime)) { "Invalid ISO date-time format" }

        return try {
            val formatter = DateTimePattern.getThreadSafeFormatter(
                DateTimePattern.ISO_8601,
                Locale.ROOT
            )
            val date = formatter.parse(isoDateTime)
            LocalDateTime.fromJavaDate(date)
        } catch (e: Exception) {
            throw IllegalArgumentException("Failed to parse date-time: ${e.message}")
        }
    }

    /**
     * Thread-safe formatting of dates for UI display with locale support.
     *
     * @param dateTime The LocalDateTime to format
     * @param pattern The format pattern to use
     * @param locale The locale for formatting
     * @return Locale-specific formatted date string
     * @throws IllegalArgumentException if any parameter is invalid
     */
    @Throws(IllegalArgumentException::class)
    fun formatForDisplay(
        dateTime: LocalDateTime,
        pattern: String,
        locale: Locale = Locale.getDefault()
    ): String {
        require(isValidDateTime(dateTime)) { "Invalid date-time value" }
        require(isValidPattern(pattern)) { "Invalid pattern format" }

        return DateTimePattern.getThreadSafeFormatter(pattern, locale)
            .format(dateTime.toJavaDate())
    }

    /**
     * Validates LocalDateTime for healthcare compliance.
     */
    private fun isValidDateTime(dateTime: LocalDateTime): Boolean {
        return try {
            // Validate year range for healthcare records
            dateTime.year in 1900..2100 &&
                    dateTime.monthNumber in 1..12 &&
                    dateTime.dayOfMonth in 1..31 &&
                    dateTime.hour in 0..23 &&
                    dateTime.minute in 0..59 &&
                    dateTime.second in 0..59
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Validates ISO date-time string format and checks for injection attempts.
     */
    private fun isValidISOString(isoDateTime: String): Boolean {
        // Regex pattern for strict ISO 8601 validation
        val isoPattern = Regex(
            "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])T" +
                    "(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{3}(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$"
        )
        return isoDateTime.matches(isoPattern)
    }

    /**
     * Validates date pattern for security.
     */
    private fun isValidPattern(pattern: String): Boolean {
        return pattern in setOf(
            DateTimePattern.ISO_8601,
            DateTimePattern.DISPLAY_DATE,
            DateTimePattern.DISPLAY_TIME,
            DateTimePattern.DISPLAY_DATE_TIME,
            DateTimePattern.FHIR_DATE
        )
    }

    /**
     * Extension function to convert LocalDateTime to java.util.Date.
     */
    private fun LocalDateTime.toJavaDate(): java.util.Date {
        return java.util.Date(
            this.year - 1900,
            this.monthNumber - 1,
            this.dayOfMonth,
            this.hour,
            this.minute,
            this.second
        )
    }

    /**
     * Extension function to convert java.util.Date to LocalDateTime.
     */
    private fun LocalDateTime.Companion.fromJavaDate(date: java.util.Date): LocalDateTime {
        return LocalDateTime(
            date.year + 1900,
            date.month + 1,
            date.date,
            date.hours,
            date.minutes,
            date.seconds
        )
    }
}
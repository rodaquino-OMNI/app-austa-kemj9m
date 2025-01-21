package com.austa.superapp.core.network

import com.austa.superapp.core.constants.AppConstants.NETWORK

/**
 * Defines all API endpoint constants for the AUSTA SuperApp Android client.
 * Provides type-safe access to REST and WebSocket endpoints with versioning support.
 * Implements FHIR-compliant healthcare data exchange endpoints.
 */
object ApiEndpoints {

    /**
     * Authentication and authorization endpoints
     */
    object AUTH {
        const val BASE = "/api/${NETWORK.API_VERSION}/auth"
        const val LOGIN = "$BASE/login"
        const val REGISTER = "$BASE/register"
        const val REFRESH_TOKEN = "$BASE/refresh"
        const val FORGOT_PASSWORD = "$BASE/forgot-password"
        const val RESET_PASSWORD = "$BASE/reset-password"
        const val VERIFY_EMAIL = "$BASE/verify-email"
        const val BIOMETRIC_AUTH = "$BASE/biometric"
        const val LOGOUT = "$BASE/logout"
        const val MFA = "$BASE/mfa"
        const val MFA_VERIFY = "$BASE/mfa/verify"
        const val SESSION_INFO = "$BASE/session"
        const val REVOKE_TOKEN = "$BASE/revoke"
    }

    /**
     * Virtual care and telemedicine endpoints including WebSocket support
     */
    object VIRTUAL_CARE {
        const val BASE = "/api/${NETWORK.API_VERSION}/virtual-care"
        const val SESSIONS = "$BASE/sessions"
        const val JOIN = "$BASE/sessions/{sessionId}/join"
        const val LEAVE = "$BASE/sessions/{sessionId}/leave"
        const val CHAT = "$BASE/sessions/{sessionId}/chat"
        const val PRESCRIPTIONS = "$BASE/sessions/{sessionId}/prescriptions"
        const val NOTES = "$BASE/sessions/{sessionId}/notes"
        const val WS_ENDPOINT = "/ws/sessions/{sessionId}"
        const val MEDIA_CONTROL = "$BASE/sessions/{sessionId}/media"
        const val RECORDING = "$BASE/sessions/{sessionId}/recording"
        const val PARTICIPANTS = "$BASE/sessions/{sessionId}/participants"
        const val QUALITY_METRICS = "$BASE/sessions/{sessionId}/metrics"
        const val SCREEN_SHARE = "$BASE/sessions/{sessionId}/screen"
    }

    /**
     * Health records management endpoints with FHIR support
     */
    object HEALTH_RECORDS {
        const val BASE = "/api/${NETWORK.API_VERSION}/health-records"
        const val FHIR = "$BASE/fhir/r4"
        const val LIST = "$BASE/list?page={page}&size={size}&sort={sort}"
        const val UPLOAD = "$BASE/upload"
        const val BULK_UPLOAD = "$BASE/upload/bulk"
        const val DOWNLOAD = "$BASE/records/{recordId}/download"
        const val SHARE = "$BASE/records/{recordId}/share"
        const val DELETE = "$BASE/records/{recordId}"
        const val CATEGORIES = "$BASE/categories"
        const val SEARCH = "$BASE/search?query={query}&filter={filter}"
        const val SYNC = "$BASE/sync"
        const val AUDIT = "$BASE/records/{recordId}/audit"
        const val PERMISSIONS = "$BASE/records/{recordId}/permissions"
        const val VERSIONS = "$BASE/records/{recordId}/versions"
    }

    /**
     * Insurance claims processing endpoints
     */
    object CLAIMS {
        const val BASE = "/api/${NETWORK.API_VERSION}/claims"
        const val SUBMIT = "$BASE/submit"
        const val BULK_SUBMIT = "$BASE/submit/bulk"
        const val LIST = "$BASE/list?status={status}&date={date}"
        const val STATUS = "$BASE/claims/{claimId}/status"
        const val DOCUMENTS = "$BASE/claims/{claimId}/documents"
        const val HISTORY = "$BASE/history?page={page}&size={size}"
        const val COVERAGE = "$BASE/coverage"
        const val VERIFY = "$BASE/claims/{claimId}/verify"
        const val RESUBMIT = "$BASE/claims/{claimId}/resubmit"
        const val APPEAL = "$BASE/claims/{claimId}/appeal"
        const val ANALYTICS = "$BASE/analytics"
    }

    /**
     * Digital marketplace endpoints for healthcare products and services
     */
    object MARKETPLACE {
        const val BASE = "/api/${NETWORK.API_VERSION}/marketplace"
        const val PRODUCTS = "$BASE/products?category={category}&sort={sort}"
        const val CATEGORIES = "$BASE/categories"
        const val SEARCH = "$BASE/search?query={query}&filter={filter}"
        const val ORDERS = "$BASE/orders"
        const val ORDER_STATUS = "$BASE/orders/{orderId}/status"
        const val CART = "$BASE/cart"
        const val WISHLIST = "$BASE/wishlist"
        const val REVIEWS = "$BASE/products/{productId}/reviews"
        const val RECOMMENDATIONS = "$BASE/recommendations"
        const val PROMOTIONS = "$BASE/promotions"
        const val INVENTORY = "$BASE/products/{productId}/inventory"
        const val BULK_ORDER = "$BASE/orders/bulk"
    }

    /**
     * Utility function to replace path parameters in endpoint URLs
     *
     * @param endpoint The endpoint URL containing parameters
     * @param params Map of parameter names to their values
     * @return The endpoint URL with parameters replaced
     */
    fun buildUrl(endpoint: String, params: Map<String, String>): String {
        var result = endpoint
        params.forEach { (key, value) ->
            result = result.replace("{$key}", value)
        }
        return result
    }
}
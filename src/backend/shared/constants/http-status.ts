/**
 * @fileoverview HTTP Status Code Constants and Utilities
 * Implements RFC 7231 compliant status codes with TypeScript enums for type safety
 * and provides utility functions for status code range validation.
 * 
 * @version 1.0.0
 */

/**
 * Enum containing standard HTTP status codes following RFC 7231 specification.
 * Used across AUSTA SuperApp microservices for consistent API responses.
 */
export enum HttpStatus {
  // 2xx Success
  OK = 200,                    // Standard response for successful HTTP requests
  CREATED = 201,              // Request fulfilled, new resource created
  ACCEPTED = 202,             // Request accepted but processing not completed
  NO_CONTENT = 204,           // Request processed, no content to return

  // 4xx Client Errors
  BAD_REQUEST = 400,          // Request cannot be fulfilled due to bad syntax
  UNAUTHORIZED = 401,         // Authentication is required and has failed
  FORBIDDEN = 403,            // Server refuses to fulfill valid request
  NOT_FOUND = 404,           // Requested resource could not be found
  METHOD_NOT_ALLOWED = 405,   // Request method not supported for given resource
  CONFLICT = 409,            // Request conflicts with current state of server
  UNPROCESSABLE_ENTITY = 422, // Request well-formed but semantically incorrect

  // 5xx Server Errors
  INTERNAL_SERVER_ERROR = 500, // Generic server error message
  SERVICE_UNAVAILABLE = 503,   // Server temporarily unavailable
  GATEWAY_TIMEOUT = 504        // Gateway timeout while waiting for response
}

/**
 * Checks if the provided HTTP status code is in the client error range (400-499).
 * Used for error handling and logging categorization.
 * 
 * @param {number} status - The HTTP status code to check
 * @returns {boolean} True if status is a client error code (400-499), false otherwise
 */
export function isClientErrorStatus(status: number): boolean {
  return status >= HttpStatus.BAD_REQUEST && status < HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * Checks if the provided HTTP status code is in the server error range (500-599).
 * Used for error handling and logging categorization.
 * 
 * @param {number} status - The HTTP status code to check
 * @returns {boolean} True if status is a server error code (500-599), false otherwise
 */
export function isServerErrorStatus(status: number): boolean {
  return status >= HttpStatus.INTERNAL_SERVER_ERROR && status < 600;
}
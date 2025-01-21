import type { Config } from '@jest/globals';
import { defaults as tsjPreset } from 'ts-jest/presets';

/**
 * Jest configuration for AUSTA SuperApp backend testing
 * Version: 29.7.0
 * 
 * This configuration ensures:
 * - HIPAA compliance in test environments
 * - Comprehensive security testing coverage
 * - Isolated microservices testing
 * - Standardized testing across all backend services
 */
const config: Config = {
  // Use TypeScript preset with healthcare-compliant configuration
  preset: 'ts-jest',

  // Secure Node.js test environment
  testEnvironment: 'node',

  // Microservices root directories for test discovery
  roots: [
    '<rootDir>/api-gateway',
    '<rootDir>/auth-service',
    '<rootDir>/virtual-care-service',
    '<rootDir>/health-records-service',
    '<rootDir>/claims-service',
    '<rootDir>/marketplace-service'
  ],

  // Module path aliases for clean imports across microservices
  moduleNameMapper: {
    '@shared/(.*)': '<rootDir>/shared/$1',
    '@auth/(.*)': '<rootDir>/auth-service/src/$1',
    '@claims/(.*)': '<rootDir>/claims-service/src/$1',
    '@health-records/(.*)': '<rootDir>/health-records-service/src/$1',
    '@marketplace/(.*)': '<rootDir>/marketplace-service/src/$1',
    '@virtual-care/(.*)': '<rootDir>/virtual-care-service/src/$1'
  },

  // Test file pattern matching
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',

  // Supported file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Coverage configuration with security thresholds
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Test setup file for shared configurations
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // TypeScript configuration for secure compilation
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
      diagnostics: true,
      isolatedModules: true
    }
  },

  // Extended timeout for healthcare operations
  testTimeout: 30000,

  // Detailed test output
  verbose: true,

  // Secure mock handling
  clearMocks: true,
  restoreMocks: true,

  // Exclude patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],

  // TypeScript transformation
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  // Parallel test execution with resource limits
  maxWorkers: '50%',

  // Test environment options
  testEnvironmentOptions: {
    url: 'http://localhost'
  }
};

export default config;
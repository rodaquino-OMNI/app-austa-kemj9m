import type { Config } from '@jest/types';

// Jest configuration for AUSTA SuperApp web application
// Version: @jest/types ^29.7.0
const config: Config.InitialOptions = {
  // Test environment setup
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  
  // File extensions to consider for testing
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Setup files for test environment configuration
  setupFilesAfterEnv: [
    '<rootDir>/src/setupTests.ts',
    '<rootDir>/src/test/securitySetup.ts',
    '<rootDir>/src/test/mockServices.ts'
  ],
  
  // Patterns to ignore during test discovery
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/cypress/',
    '/coverage/',
    '/.husky/'
  ],
  
  // TypeScript transformation configuration
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      diagnostics: true,
      isolatedModules: true
    }]
  },
  
  // Module name resolution mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@security/(.*)$': '<rootDir>/src/security/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@styles/(.*)$': '<rootDir>/src/styles/$1',
    '^@test/(.*)$': '<rootDir>/src/test/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/src/test/fileMock.ts'
  },
  
  // Coverage collection configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/test/**/*',
    '!src/**/*.mock.{ts,tsx}'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/security/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Watch plugins for development
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Test result reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'coverage/junit',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ],
  
  // Test execution configuration
  testTimeout: 10000,
  maxWorkers: '50%',
  verbose: true,
  
  // Global variables
  globals: {
    TEST_ENV: 'test',
    JEST_TIMEOUT: 10000
  }
};

export default config;
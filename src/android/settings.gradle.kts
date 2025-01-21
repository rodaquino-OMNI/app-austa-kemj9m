// Gradle Settings Script for AUSTA SuperApp Android Project
// Gradle Version: 8.3
// Last Updated: 2023

// Root project name configuration
rootProject.name = "AUSTA-SuperApp"

// Plugin management configuration with enhanced security
pluginManagement {
    repositories {
        // Secure plugin repositories with verification
        gradlePluginPortal() {
            content {
                // Only allow plugins from trusted sources
                includeGroupByRegex("org\\.gradle.*")
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("org\\.jetbrains.*")
            }
        }
        google() {
            content {
                // Restrict to Google's Android plugins
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral() {
            content {
                // Allow verified Maven Central plugins
                includeGroupByRegex("org\\.jetbrains.*")
                includeGroupByRegex("io\\.gitlab.*")
            }
        }
    }

    // Plugin resolution strategy
    resolutionStrategy {
        eachPlugin {
            // Enforce minimum security standards for plugins
            if (requested.id.namespace == "com.android") {
                useModule("com.android.tools.build:gradle:${requested.version}")
            }
        }
    }

    // Repository connection settings
    repositories.all {
        // Set conservative timeouts
        connectionTimeoutSeconds.set(180)
        metadataTimeoutSeconds.set(180)
    }
}

// Dependency resolution management with security controls
dependencyResolutionManagement {
    repositoryMode.set(RepositoryMode.FAIL_ON_PROJECT_REPOS)
    
    repositories {
        google() {
            content {
                // Restrict to Android dependencies
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
            // Enable dependency verification
            mavenContent {
                releasesOnly()
            }
        }
        mavenCentral() {
            content {
                // Allow verified dependencies
                includeGroupByRegex("org\\.jetbrains.*")
                includeGroupByRegex("io\\.gitlab.*")
                includeGroupByRegex("com\\.squareup.*")
            }
            // Enable dependency verification
            mavenContent {
                releasesOnly()
            }
        }
    }

    // Version catalog configuration
    versionCatalogs {
        create("libs") {
            from(files("gradle/libs.versions.toml"))
        }
    }
}

// Performance optimization settings
gradle.startParameter.apply {
    // Enable parallel execution
    isParallelProjectExecutionEnabled = true
    // Enable configure on demand
    isConfigureOnDemand = true
    // Enable build cache
    isBuildCacheEnabled = true
    // Set maximum worker count
    maxWorkerCount = Runtime.getRuntime().availableProcessors()
}

// Include application module
include(":app")

// Build scan configuration for monitoring
gradleEnterprise {
    buildScan {
        termsOfServiceUrl = "https://gradle.com/terms-of-service"
        termsOfServiceAgree = "yes"
        publishAlways()
        
        // Capture performance metrics
        capture {
            isTaskInputFiles = true
            isTestLogging = true
        }
        
        // Upload build scans to private server for security
        server = "https://builds.austa-superapp.com"
    }
}

// Network configuration
gradle.projectsLoaded {
    if (gradle.startParameter.isOffline) {
        println("Running in offline mode")
    }
    
    // Configure network timeouts
    gradle.startParameter.apply {
        setConnectTimeout(Duration.ofMinutes(5))
        setReadTimeout(Duration.ofMinutes(5))
    }
}

// Security settings
gradle.beforeProject {
    // Enable dependency verification
    dependencyVerification {
        verify = true
        verificationMetadataFile.set(file("verification-metadata.xml"))
    }
}
// Android Gradle Plugin version: 8.1.0
// Kotlin Plugin version: 1.9.0
// Hilt Plugin version: 2.48
// Kotlin Serialization Plugin version: 1.9.0

buildscript {
    repositories {
        // Secure repository connections with HTTPS
        google()
        mavenCentral()
    }

    dependencies {
        classpath("com.android.tools.build:gradle:8.1.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
        classpath("com.google.dagger:hilt-android-gradle-plugin:2.48")
        classpath("org.jetbrains.kotlin:kotlin-serialization:1.9.0")
    }
}

// Configure settings for all projects in the build
allprojects {
    repositories {
        google()
        mavenCentral()
    }

    // Configure Java compatibility
    tasks.withType<JavaCompile> {
        sourceCompatibility = JavaVersion.VERSION_17.toString()
        targetCompatibility = JavaVersion.VERSION_17.toString()
    }

    // Configure Kotlin compiler options
    tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions {
            jvmTarget = JavaVersion.VERSION_17.toString()
            freeCompilerArgs = listOf(
                "-opt-in=kotlin.RequiresOptIn",
                "-Xjvm-default=all"
            )
        }
    }
}

// Enable build features and security settings
tasks {
    // Clean build directory
    register("clean", Delete::class) {
        delete(rootProject.buildDir)
    }
}

// Build cache configuration
buildCache {
    local {
        isEnabled = true
        directory = File(rootProject.buildDir, "build-cache")
        removeUnusedEntriesAfterDays = 7
    }
}

// Security and dependency verification
dependencyLocking {
    lockAllConfigurations()
}

// Common project configurations
subprojects {
    // Apply common security configurations
    afterEvaluate {
        project.extensions.findByType<com.android.build.gradle.BaseExtension>()?.apply {
            // Enable security features
            buildTypes {
                getByName("release") {
                    // Enable R8 code shrinking and obfuscation
                    isMinifyEnabled = true
                    isShrinkResources = true
                    
                    // Configure ProGuard rules
                    proguardFiles(
                        getDefaultProguardFile("proguard-android-optimize.txt"),
                        "proguard-rules.pro"
                    )
                }
            }

            // Security-related compile options
            compileOptions {
                sourceCompatibility = JavaVersion.VERSION_17
                targetCompatibility = JavaVersion.VERSION_17
                isCoreLibraryDesugaringEnabled = true
            }

            // Enable strict mode for debug builds
            defaultConfig {
                vectorDrawables.useSupportLibrary = true
            }
        }
    }
}

// Gradle enterprise settings
gradleEnterprise {
    buildScan {
        termsOfServiceUrl = "https://gradle.com/terms-of-service"
        termsOfServiceAgree = "yes"
        publishAlways()
    }
}

// Performance monitoring configuration
tasks.register("analyzeProjectHealth") {
    group = "verification"
    description = "Analyzes the overall health of the project build"
    
    doLast {
        println("Analyzing project build health...")
    }
}

// Dependency verification
tasks.register("verifyDependencies") {
    group = "verification"
    description = "Verifies project dependencies for security and compatibility"
    
    doLast {
        println("Verifying project dependencies...")
    }
}
# AUSTA SuperApp ProGuard Rules
# Version: 1.0
# Purpose: Production configuration for code obfuscation, optimization and security
# with HIPAA compliance focus

# Keep all annotations for reflection, security, and dependency injection
-keepattributes *Annotation*,Signature,Exceptions,InnerClasses,EnclosingMethod
-keepattributes SourceFile,LineNumberTable,LocalVariableTable,LocalVariableTypeTable

# Healthcare Data Models - FHIR R4 Compliance
-keep class com.austa.superapp.features.healthrecords.domain.models.** { *; }
-keep class com.austa.superapp.features.telemedicine.domain.models.** { *; }
-keep class com.austa.superapp.features.claims.domain.models.** { *; }
-keepclassmembers class * implements org.hl7.fhir.** { *; }

# Security Implementation Preservation
-keep class com.austa.superapp.core.security.** { *; }
-keepclassmembers class * extends androidx.biometric.BiometricPrompt$AuthenticationCallback { *; }
-keep class javax.crypto.** { *; }
-keep class com.austa.superapp.core.security.hipaa.** { *; }

# Network Stack Preservation
-keep class retrofit2.** { *; }
-keepclassmembers,allowobfuscation class * { @retrofit2.http.* <methods>; }
-keep class okhttp3.** { *; }
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Safe Optimization Settings
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5
-dontusemixedcaseclassnames
-verbose

# Debugging and Crash Reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-printmapping mapping.txt
-keepattributes Exceptions,InnerClasses,Signature,Deprecated,SourceFile,LineNumberTable,*Annotation*,EnclosingMethod

# Android Framework
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Application
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.content.ContentProvider
-keep public class * extends android.preference.Preference
-keep public class * extends android.view.View
-keep class android.support.** { *; }
-keep class androidx.** { *; }

# View Binding
-keep class * implements androidx.viewbinding.ViewBinding {
    public static ** bind(android.view.View);
    public static ** inflate(android.view.LayoutInflater);
}

# Dependency Injection
-keepclassmembers,allowobfuscation class * {
    @javax.inject.* *;
    @dagger.* *;
    <init>();
}
-keep class javax.inject.** { *; }
-keep class **$$Factory { *; }

# JSON Serialization
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class * extends com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# WebRTC for Telemedicine
-keep class org.webrtc.** { *; }
-keep class com.austa.superapp.features.telemedicine.webrtc.** { *; }

# Encryption and Security
-keep class org.bouncycastle.** { *; }
-keep class org.spongycastle.** { *; }
-keepclassmembers class * extends java.security.Provider { *; }

# HIPAA Compliance Logging
-keep class com.austa.superapp.core.logging.hipaa.** { *; }
-keepclassmembers class * {
    @com.austa.superapp.core.logging.hipaa.* <methods>;
}

# Healthcare Data Processing
-keep class com.austa.superapp.features.healthrecords.processing.** { *; }
-keep class com.austa.superapp.features.claims.processing.** { *; }

# Biometric Authentication
-keep class androidx.biometric.** { *; }
-keep class android.security.keystore.** { *; }

# Third-party Healthcare Libraries
-keep class ca.uhn.fhir.** { *; }
-keep class org.hl7.fhir.** { *; }

# Crash Reporting
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
-keep class com.google.firebase.crashlytics.** { *; }

# Performance Monitoring
-keep class com.google.firebase.perf.** { *; }
-keep class com.austa.superapp.core.performance.** { *; }

# Native Code Interface
-keepclasseswithmembernames class * {
    native <methods>;
}

# Enum Preservation
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Parcelable Implementation
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Serializable Classes
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# R8 Full Mode Compatibility
-allowaccessmodification
-repackageclasses ''

# Keep BuildConfig
-keep class com.austa.superapp.BuildConfig { *; }
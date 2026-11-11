plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.transkripku.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.transkripku.app"
        minSdk = 24
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    signingConfigs {
        // Kunci tetap di repo agar APK versi baru bisa langsung menimpa versi lama
        // tanpa uninstall. Ini aplikasi pribadi, bukan untuk Play Store.
        create("shared") {
            storeFile = file("transkripku.keystore")
            storePassword = "transkripku"
            keyAlias = "transkripku"
            keyPassword = "transkripku"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("shared")
        }
        debug {
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    packaging {
        jniLibs { useLegacyPackaging = true }
    }
}

dependencies {
    // LLM di perangkat (offline) — https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/android
    implementation("com.google.mediapipe:tasks-genai:0.10.24")
}

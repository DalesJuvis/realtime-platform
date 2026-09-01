plugins {
    id("com.android.library") version "8.5.2"
    kotlin("android") version "1.9.24"
}

android {
    namespace = "com.yourorg.realtimesdk"
    compileSdk = 34

    defaultConfig {
        // minSdk 21 (Android 5.0) : plancher standard OkHttp/Kotlin,
        // aucune API spécifique à une version d'Android plus récente
        // n'est utilisée dans ce SDK.
        minSdk = 21
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
    // Même version que le runtime OkHttp ci-dessus — sert un vrai serveur
    // HTTP local en test pour publishTemplate() (RealtimeClientTest),
    // plutôt que de mocker OkHttpClient à la main.
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}

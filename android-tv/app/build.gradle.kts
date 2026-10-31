plugins {
    id("com.android.application")
}

android {
    namespace = "com.rskdec.doodlecritters"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.rskdec.doodlecritters"
        minSdk = 24
        targetSdk = 35
        // CI run number, so each new build installs over the previous one.
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    // Sideload-only key, committed so every build can update the installed app.
    // Use a private key (kept out of git) before publishing to the Play Store.
    signingConfigs {
        create("sideload") {
            storeFile = file("critters-tv.keystore")
            storePassword = "critters-tv"
            keyAlias = "critters-tv"
            keyPassword = "critters-tv"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("sideload")
        }
    }

    buildFeatures {
        // MainActivity reads BuildConfig.VERSION_NAME; AGP 8 no longer generates it by default.
        buildConfig = true
    }

    // A one-screen WebView wrapper: don't let release lint block the build.
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

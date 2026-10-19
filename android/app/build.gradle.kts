plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "cat.xcloud"
    compileSdk = 34

    defaultConfig {
        applicationId = "cat.xcloud.catala"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Per distribuir-lo, signa'l amb el teu propi keystore. El debug ja és instal·lable.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}

// Copia l'script compilat (dist/xcloud-catala.user.js) als assets de l'app
val copyUserScript by tasks.registering(Copy::class) {
    from(rootProject.file("../dist/xcloud-catala.user.js"))
    // Pàgina d'espectador del repetidor (la mateixa que fa servir el relé del PC)
    from(rootProject.file("../relay/viewer.html")) { rename { "relay-viewer.html" } }
    into(layout.projectDirectory.dir("src/main/assets"))
}
tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(copyUserScript) }

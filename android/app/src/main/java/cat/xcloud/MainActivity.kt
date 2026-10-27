package cat.xcloud

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import androidx.activity.result.contract.ActivityResultContracts
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Embolcall mínim d'xbox.com/play: carrega la pàgina en un WebView i hi injecta
 * l'script "xCloud Català" abans que s'executi cap codi de la pàgina.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var pendingMicRequest: PermissionRequest? = null
    private var bridge: AppBridge? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        fileCallback?.onReceiveValue(if (result.resultCode == Activity.RESULT_OK) uris else null)
        fileCallback = null
    }

    // Dominis que es poden obrir dins l'app (inici de sessió de Microsoft inclòs)
    private val allowedHosts = listOf(
        "xbox.com", "xboxlive.com", "microsoft.com", "live.com",
        "microsoftonline.com", "msauth.net", "msftauth.net", "office.com",
    )

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this)
        setContentView(webView)
        hideSystemBars()

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // ws://127.0.0.1 (ratolí i relé locals) des de la pàgina https: el mode de compatibilitat l'accepta
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = userAgentString.replace("; wv", "").replace(Regex("Version/\\S+\\s"), "")
        }

        // Pont amb l'app: ratolí/teclat natius, captures, vibració, dreceres...
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        bridge = AppBridge(this, webView).also { b ->
            webView.addJavascriptInterface(b, "AppInterface")
            webView.setOnCapturedPointerListener { _, event -> b.onCapturedPointer(event); true }
        }

        val script = loadUserScript()
        if (script == null) {
            Toast.makeText(this, R.string.script_missing, Toast.LENGTH_LONG).show()
        } else if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            // Injecció abans de qualsevol codi de la pàgina (equivalent a @run-at document-start)
            WebViewCompat.addDocumentStartJavaScript(webView, script, setOf("https://www.xbox.com"))
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = request.url.host ?: return true
                if (allowedHosts.any { host == it || host.endsWith(".$it") }) {
                    return false
                }
                // La resta d'enllaços s'obren al navegador del sistema
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    fileChooser.launch(params.createIntent())
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                        request.grant(request.resources)
                    } else {
                        pendingMicRequest = request
                        ActivityCompat.requestPermissions(this@MainActivity, arrayOf(Manifest.permission.RECORD_AUDIO), 1)
                    }
                }
            }
        }

        val url = intent?.data?.toString()?.takeIf { it.startsWith("https://www.xbox.com/") }
            ?: "https://www.xbox.com/play"
        if (savedInstanceState == null) webView.loadUrl(url) else webView.restoreState(savedInstanceState)
    }

    private fun loadUserScript(): String? = try {
        assets.open("xcloud-catala.user.js").bufferedReader().use { it.readText() }
    } catch (e: Exception) {
        null
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val request = pendingMicRequest ?: return
        pendingMicRequest = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            request.grant(request.resources)
        } else {
            request.deny()
            Toast.makeText(this, R.string.mic_denied, Toast.LENGTH_LONG).show()
        }
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onPointerCaptureChanged(hasCapture: Boolean) {
        super.onPointerCaptureChanged(hasCapture)
        bridge?.onCaptureChanged(hasCapture)
    }

    override fun onPause() {
        super.onPause()
        // Si el relé està actiu no pausem el WebView: els timers JS, WebSocket i WebRTC
        // s'han de mantenir vius perquè no es perdi la connexió amb els espectadors.
        if (bridge?.isRelayActive() != true) {
            webView.onPause()
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        bridge?.destroy()
        webView.destroy()
        super.onDestroy()
    }
}

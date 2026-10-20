package cat.xcloud

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Mode espectador: cerca les partides compartides a la xarxa, i en tocar-ne una carrega la pàgina
 * d'espectador (inclosa a l'app) i demana accés a l'amfitrió, que ho aprova a la seva pantalla.
 *
 * La pàgina es serveix des d'un origen segur intern (https://appassets...) perquè el navegador deixi llegir
 * els mandos físics; la connexió al relé va per ws:// a la xarxa local.
 */
class ViewerActivity : AppCompatActivity() {

    private lateinit var root: FrameLayout
    private lateinit var listScreen: ScrollView
    private lateinit var hostsBox: LinearLayout
    private lateinit var status: android.widget.TextView
    private var webView: WebView? = null
    @Volatile private var scanning = false

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#111111")) }
        setContentView(root)
        buildList()
        scan()
    }

    // ---------------------------------------------------------------- Llista de partides

    private fun buildList() {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(UiKit.dp(this@ViewerActivity, 24), UiKit.dp(this@ViewerActivity, 24), UiKit.dp(this@ViewerActivity, 24), UiKit.dp(this@ViewerActivity, 24))
        }

        column.addView(UiKit.text(this, "📺 Partides a la xarxa", 22f, bold = true))
        status = UiKit.text(this, "", 14f).apply { alpha = 0.8f }
        column.addView(status)

        hostsBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        column.addView(hostsBox)

        column.addView(UiKit.button(this, "🔄  Torna a buscar", Color.parseColor("#3A3B40")).apply { setOnClickListener { scan() } })

        column.addView(UiKit.text(this, "O escriu l'adreça de l'amfitrió", 14f).apply { alpha = 0.8f })
        val input = EditText(this).apply {
            hint = "192.168.1.20  (o 192.168.1.20:8787)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            setSingleLine()
        }
        column.addView(input)
        column.addView(UiKit.button(this, "Connecta", Color.parseColor("#2D6CDF")).apply {
            setOnClickListener { joinManual(input.text.toString().trim()) }
        })

        listScreen = ScrollView(this).apply {
            isFillViewport = true
            addView(column, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        root.addView(listScreen, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }

    private fun scan() {
        if (scanning) return
        scanning = true
        status.text = "Cercant partides a la xarxa…"
        hostsBox.removeAllViews()

        Thread({
            val hosts = try { Discovery.scan() } catch (e: Exception) { emptyList() }
            runOnUiThread {
                scanning = false
                if (isFinishing || webView != null) return@runOnUiThread
                renderHosts(hosts)
            }
        }, "viewer-scan").apply { isDaemon = true }.start()
    }

    private fun renderHosts(hosts: List<Discovery.Host>) {
        hostsBox.removeAllViews()
        if (hosts.isEmpty()) {
            status.text = "No s'ha trobat cap partida. Comprova que l'amfitrió té el repetidor activat i que sou a la mateixa Wi-Fi, o escriu-ne l'adreça."
            return
        }

        status.text = "Toca una partida per unir-t'hi:"
        hosts.forEach { h ->
            val label = "📺  ${h.name}  ·  ${h.ip}" + if (h.hostOnline) "" else "\n(encara no hi ha cap partida en marxa)"
            hostsBox.addView(UiKit.button(this, label).apply { setOnClickListener { join(h.ip, h.port) } })
        }
    }

    private fun joinManual(text: String) {
        val m = Regex("^([A-Za-z0-9.\\-]+)(?::(\\d{1,5}))?$").matchEntire(text)
        if (m == null) {
            Toast.makeText(this, "Adreça no vàlida", Toast.LENGTH_SHORT).show()
            return
        }
        join(m.groupValues[1], m.groupValues[2].ifEmpty { "8787" }.toInt())
    }

    // ---------------------------------------------------------------- Espectador (WebView)

    @SuppressLint("SetJavaScriptEnabled")
    private fun join(ip: String, port: Int) {
        if (webView != null) return

        val wv = WebView(this)
        webView = wv
        with(wv.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // La pàgina és https (origen intern de l'app) i es connecta a ws:// de la xarxa local
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = false
            allowContentAccess = false
        }

        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            // Aquest WebView només pot mostrar la pàgina inclosa a l'app
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != "appassets.androidplatform.net"
        }

        val url = Uri.parse("https://appassets.androidplatform.net/assets/relay-viewer.html").buildUpon()
            .appendQueryParameter("host", "$ip:$port")
            .appendQueryParameter("auto", "1")
            .appendQueryParameter("name", Build.MODEL ?: "Android")
            .build().toString()

        listScreen.visibility = android.view.View.GONE
        root.addView(wv, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        wv.loadUrl(url)
    }

    private fun leaveViewer() {
        webView?.let {
            root.removeView(it)
            it.destroy()
        }
        webView = null
        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowInsetsControllerCompat(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
        listScreen.visibility = android.view.View.VISIBLE
        scan()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView != null) leaveViewer() else super.onBackPressed()
    }

    override fun onPause() { super.onPause(); webView?.onPause() }
    override fun onResume() { super.onResume(); webView?.onResume() }
    override fun onDestroy() { webView?.destroy(); super.onDestroy() }
}

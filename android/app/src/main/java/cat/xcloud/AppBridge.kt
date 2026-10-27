package cat.xcloud

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.view.MotionEvent
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Implementa el contracte `window.AppInterface` que l'script espera de l'app Android:
 * ratolí/teclat (servidor de punter local), captures, vibració, dreceres i desar fitxers.
 */
class AppBridge(private val activity: MainActivity, private val webView: WebView) {

    private val ui = Handler(Looper.getMainLooper())
    private val server = LocalWebSocketServer("https://www.xbox.com") { client ->
        // Versió del protocol: [127][uint16 = 2]
        client.sendBinary(byteArrayOf(127, 0, 2))
    }

    // Relé de xarxa local (repetidor de la partida a altres dispositius)
    private val relay = RelayServer(Build.MODEL ?: "Android", {
        activity.assets.open("relay-viewer.html").use { it.readBytes() }
    })

    @JavascriptInterface
    fun startRelayServer(): Int {
        val port = relay.start(8787)
        if (port > 0) {
            try {
                RelayService.start(activity)
            } catch (_: Exception) {
                // Sense permís de notificació o restricció del sistema: el relé continua
            }
        }
        return port
    }

    @JavascriptInterface
    fun stopRelayServer() {
        relay.stop()
        try {
            RelayService.stop(activity)
        } catch (_: Exception) {
        }
    }

    /** True mentre el relé està actiu (servei en primer pla o servidor en marxa). */
    fun isRelayActive(): Boolean = RelayService.isRunning || relay.port > 0

    // Residu decimal dels desplaçaments relatius del ratolí
    private var remX = 0f
    private var remY = 0f
    private var lastButtons = 0

    private fun toast(text: String) = ui.post { Toast.makeText(activity, text, Toast.LENGTH_SHORT).show() }

    // ---------------------------------------------------------------- Ratolí (punter capturat)

    @JavascriptInterface
    fun startPointerServer(): Int = server.start(9269)

    @JavascriptInterface
    fun requestPointerCapture() {
        ui.post {
            webView.requestFocus()
            webView.requestPointerCapture()
        }
    }

    @JavascriptInterface
    fun releasePointerCapture() {
        ui.post { webView.releasePointerCapture() }
    }

    fun onCaptureChanged(hasCapture: Boolean) {
        server.broadcast(byteArrayOf(5, if (hasCapture) 1 else 0))
        if (!hasCapture) lastButtons = 0
    }

    /** Esdeveniments del punter capturat -> missatges binaris del protocol. */
    fun onCapturedPointer(event: MotionEvent) {
        // Moviment relatiu (inclou mostres agrupades)
        var dx = event.x
        var dy = event.y
        for (i in 0 until event.historySize) {
            dx += event.getHistoricalX(i)
            dy += event.getHistoricalY(i)
        }

        if (event.actionMasked == MotionEvent.ACTION_MOVE || event.actionMasked == MotionEvent.ACTION_HOVER_MOVE) {
            dx += remX; dy += remY
            val ix = dx.roundToInt().coerceIn(-32768, 32767)
            val iy = dy.roundToInt().coerceIn(-32768, 32767)
            remX = dx - ix; remY = dy - iy
            if (ix != 0 || iy != 0) {
                server.broadcast(ByteBuffer.allocate(5).put(1).putShort(ix.toShort()).putShort(iy.toShort()).array())
            }
        }

        // Botons: diferència respecte a l'estat anterior (1 = primari, 2 = secundari, 4 = terciari)
        val buttons = event.buttonState and 7
        val changed = buttons xor lastButtons
        if (changed != 0) {
            for (bit in intArrayOf(1, 2, 4)) {
                if (changed and bit != 0) {
                    val type: Byte = if (buttons and bit != 0) 2 else 3
                    server.broadcast(byteArrayOf(type, bit.toByte()))
                }
            }
            lastButtons = buttons
        }

        if (event.actionMasked == MotionEvent.ACTION_SCROLL) {
            val v = (-event.getAxisValue(MotionEvent.AXIS_VSCROLL) * 100).roundToInt()
            val h = (event.getAxisValue(MotionEvent.AXIS_HSCROLL) * 100).roundToInt()
            server.broadcast(ByteBuffer.allocate(5).put(4).putShort(v.toShort()).putShort(h.toShort()).array())
        }
    }

    fun destroy() {
        server.stop()
        relay.stop()
        try {
            RelayService.stop(activity)
        } catch (_: Exception) {
        }
    }

    // ---------------------------------------------------------------- Vibració

    @JavascriptInterface
    fun vibrate(dataJson: String, intensity: Double) {
        try {
            val data = JSONObject(dataJson)
            val vibrator = activity.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            val factor = if (intensity > 1.0) intensity / 100.0 else intensity
            val strength = max(data.optDouble("leftMotorPercent", 0.0), data.optDouble("rightMotorPercent", 0.0)) / 100.0
            val amplitude = (strength * factor * 255).roundToInt().coerceIn(0, 255)
            val duration = data.optLong("durationMs", 0)

            if (amplitude == 0 || duration <= 0) {
                vibrator.cancel()
            } else {
                vibrator.vibrate(VibrationEffect.createOneShot(duration, amplitude))
            }
        } catch (e: Exception) {
            // dades no vàlides: ignora
        }
    }

    // ---------------------------------------------------------------- Fitxers

    @JavascriptInterface
    fun saveScreenshot(name: String?, data: String) {
        val bytes = try { Base64.decode(data, Base64.DEFAULT) } catch (e: IllegalArgumentException) { return }
        val file = "${(name ?: "xcloud").replace(Regex("[^A-Za-z0-9_-]"), "_")}-${System.currentTimeMillis()}.png"
        val ok = save(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, Environment.DIRECTORY_PICTURES + "/xCloud Català", file, "image/png", bytes)
        toast(if (ok) "📷 $file" else "❌ No s'ha pogut desar la captura")
    }

    @JavascriptInterface
    fun saveTextFile(name: String, mime: String, content: String) {
        val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            save(MediaStore.Downloads.EXTERNAL_CONTENT_URI, Environment.DIRECTORY_DOWNLOADS, safe, mime, content.toByteArray())
        } else {
            save(null, "", safe, mime, content.toByteArray())
        }
        toast(if (ok) "💾 $safe" else "❌ No s'ha pogut desar el fitxer")
    }

    private fun save(collection: Uri?, relativePath: String, name: String, mime: String, bytes: ByteArray): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && collection != null) {
                val resolver = activity.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val uri = resolver.insert(collection, values) ?: return false
                resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                true
            } else {
                // Android < 10: carpeta pròpia de l'app (sense permisos addicionals)
                val dir = activity.getExternalFilesDir(null) ?: return false
                File(dir, name).writeBytes(bytes)
                true
            }
        } catch (e: Exception) {
            false
        }
    }

    // ---------------------------------------------------------------- Dreceres i altres

    @JavascriptInterface
    fun createShortcut(path: String) {
        pinShortcut("game-" + path.hashCode(), "xCloud Català", "https://www.xbox.com/en-US$path")
    }

    @JavascriptInterface
    fun createConsoleShortcut(serverId: String, deviceName: String, optionsJson: String) {
        pinShortcut("console-$serverId", deviceName, "https://www.xbox.com/en-US/play/consoles/launch/$serverId")
    }

    private fun pinShortcut(id: String, label: String, url: String) {
        ui.post {
            if (!ShortcutManagerCompat.isRequestPinShortcutSupported(activity)) {
                Toast.makeText(activity, "El llançador no admet dreceres", Toast.LENGTH_SHORT).show()
                return@post
            }

            val intent = Intent(activity, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse(url)
            }
            val info = ShortcutInfoCompat.Builder(activity, id)
                .setShortLabel(label)
                .setIcon(IconCompat.createWithResource(activity, R.mipmap.ic_launcher))
                .setIntent(intent)
                .build()
            ShortcutManagerCompat.requestPinShortcut(activity, info, null)
        }
    }

    @JavascriptInterface
    fun openTrueAchievementsLink(override: Boolean, xboxTitleId: String?, id: String?) {
        ui.post { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.trueachievements.com/"))) }
    }

    @JavascriptInterface
    fun openAppSettings() {
        ui.post {
            activity.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
            )
        }
    }

    @JavascriptInterface
    fun closeApp() { ui.post { activity.finish() } }

    @JavascriptInterface
    fun getDeepLinkData(): String = "{}"

    @JavascriptInterface
    fun downloadWallpapers(titleSlug: String?, productId: String?) = toast("Aquesta funció encara no està disponible")

    // L'script les crida sense comprovar si existeixen
    @JavascriptInterface
    fun updateLatestScript() {}

    @JavascriptInterface
    fun onEvent(event: String) {}

    @JavascriptInterface
    fun onEventBus(event: String) {}
}

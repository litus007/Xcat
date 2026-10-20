package cat.xcloud

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ScrollView
import androidx.appcompat.app.AppCompatActivity

/** Pantalla d'inici: jugar (xCloud / consola) o unir-se a una partida que algú comparteix a la xarxa. */
class StartActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(UiKit.dp(this@StartActivity, 28), UiKit.dp(this@StartActivity, 24), UiKit.dp(this@StartActivity, 28), UiKit.dp(this@StartActivity, 24))
        }

        column.addView(UiKit.text(this, "xCloud Català", 26f, bold = true))
        column.addView(UiKit.text(this, "Què vols fer?", 16f))

        column.addView(UiKit.button(this, "🎮  Jugar (xCloud / la meva consola)").apply {
            setOnClickListener {
                startActivity(Intent(this@StartActivity, MainActivity::class.java))
                finish()
            }
        })

        column.addView(UiKit.button(this, "📺  Unir-me a una partida de la xarxa", Color.parseColor("#2D6CDF")).apply {
            setOnClickListener { startActivity(Intent(this@StartActivity, ViewerActivity::class.java)) }
        })

        column.addView(UiKit.text(this, "Per veure i jugar a la partida d'un altre dispositiu de casa, que tingui el repetidor activat.", 13f).apply { alpha = 0.7f })

        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#111111"))
            isFillViewport = true
            addView(column, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT)
        })
    }
}

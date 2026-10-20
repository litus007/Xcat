package cat.xcloud

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Petits ajudants per construir les pantalles natives sense fitxers de disseny. */
object UiKit {
    fun dp(context: Context, value: Int) = (value * context.resources.displayMetrics.density).toInt()

    fun button(context: Context, text: String, color: Int = Color.parseColor("#107C10")): Button =
        Button(context).apply {
            this.text = text
            isAllCaps = false
            setTextColor(Color.WHITE)
            textSize = 17f
            setPadding(dp(context, 20), dp(context, 14), dp(context, 20), dp(context, 14))
            background = GradientDrawable().apply {
                setColor(color)
                cornerRadius = dp(context, 28).toFloat()
            }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(context, 10)
            }
        }

    fun text(context: Context, text: String, size: Float = 16f, bold: Boolean = false): TextView =
        TextView(context).apply {
            this.text = text
            textSize = size
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(context, 8)
            }
        }
}

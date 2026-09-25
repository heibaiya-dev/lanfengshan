package com.heibai.hyw.lanfengshan

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.widget.RemoteViews
import kotlin.math.cos
import kotlin.math.min

object FanWidgetRenderer {
    private val artwork = mutableMapOf<String, Bitmap>()

    private fun asset(context: Context, name: String): Bitmap = artwork.getOrPut(name) {
        context.assets.open("widget/assets/$name").use { BitmapFactory.decodeStream(it) }
    }

    fun update(context: Context, id: Int, angle: Float = 0f) {
        if (!FanWidgetStore.exists(context, id)) return
        val state = FanWidgetStore.read(context, id)
        val manager = AppWidgetManager.getInstance(context)
        val views = RemoteViews(context.packageName, R.layout.fan_widget)
        views.setImageViewBitmap(R.id.widget_fans, render(context, state, angle))
        views.setTextViewText(R.id.widget_title, FanWidgetStore.title(state.kind))
        views.setTextViewText(R.id.widget_audio, "${FanWidgetCatalog.track(context, state).label} · 选曲")
        views.setTextViewText(R.id.widget_power, if (state.running) "关闭" else "开启")
        views.setTextViewText(R.id.widget_speed, "${state.speed}档")
        views.setTextViewText(R.id.widget_oscillate, if (state.oscillating) "摇头开" else "摇头关")
        views.setTextViewText(R.id.widget_mute, if (state.muted) "取消静音" else "静音")
        listOf(
            R.id.widget_power to FanWidgetProvider.ACTION_POWER,
            R.id.widget_speed to FanWidgetProvider.ACTION_SPEED,
            R.id.widget_oscillate to FanWidgetProvider.ACTION_OSCILLATE,
            R.id.widget_mute to FanWidgetProvider.ACTION_MUTE,
        ).forEach { (viewId, action) ->
            val intent = Intent(action).setComponent(FanWidgetStore.provider(context, state.kind))
                .setData(Uri.parse("fanwidget://control/$id/${action.substringAfterLast('.')}"))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            views.setOnClickPendingIntent(viewId, PendingIntent.getBroadcast(context, id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        val picker = Intent(context, FanWidgetAudioActivity::class.java)
            .setData(Uri.parse("fanwidget://audio/$id"))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        views.setOnClickPendingIntent(R.id.widget_audio, PendingIntent.getActivity(context, id, picker,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        views.setContentDescription(R.id.widget_fans, FanWidgetStore.title(state.kind))
        manager.updateAppWidget(id, views)
    }

    /** A bounded bitmap and fitCenter keep the complete fans visible at any launcher size. */
    private fun render(context: Context, state: FanWidgetState, angle: Float): Bitmap {
        val duet = state.kind == "duet"
        val width = if (duet) 420 else 230
        val height = 340
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        if (duet) {
            drawFan(context, canvas, paint, "lanfeng", 5f, 15f, 200f, state, angle)
            drawFan(context, canvas, paint, "xuelang", 215f, 15f, 200f, state, angle)
        } else {
            drawFan(context, canvas, paint, state.kind, 5f, 0f, 220f, state, angle)
        }
        return bitmap
    }

    private fun drawFan(context: Context, canvas: Canvas, paint: Paint, kind: String, x: Float, y: Float,
        size: Float, state: FanWidgetState, angle: Float) {
        canvas.save()
        canvas.translate(x, y)
        val cx = size / 2f
        val cy = size / 2f
        paint.style = Paint.Style.FILL
        paint.color = Color.rgb(204, 167, 95)
        canvas.drawRoundRect(RectF(cx - 9f, cy, cx + 9f, size * 1.41f), 8f, 8f, paint)
        paint.color = Color.rgb(242, 210, 143)
        canvas.drawOval(RectF(size * .17f, size * 1.36f, size * .83f, size * 1.49f), paint)
        paint.color = Color.rgb(255, 236, 187)
        canvas.drawOval(RectF(size * .17f, size * 1.33f, size * .83f, size * 1.44f), paint)
        canvas.save()
        if (state.running && state.oscillating) {
            canvas.scale((.86 + .14 * cos(angle * Math.PI / 540.0)).toFloat(), 1f, cx, cy)
        }
        paint.color = Color.argb(90, 255, 249, 232)
        canvas.drawCircle(cx, cy, size * .475f, paint)
        val blade = asset(context, if (kind == "xuelang") "xuelang-blade-1.png" else "blade-1.png")
        paint.alpha = 255
        canvas.save()
        canvas.rotate(if (state.running) angle else 0f, cx, cy)
        val bladeWidth = size * if (kind == "xuelang") .34f else .285f
        val bladeHeight = bladeWidth * blade.height / blade.width
        val bladeBottom = cy + size * if (kind == "xuelang") .09f else .07f
        repeat(3) { index ->
            canvas.save()
            canvas.rotate(index * 120f, cx, cy)
            canvas.drawBitmap(blade, null, RectF(cx - bladeWidth / 2, bladeBottom - bladeHeight,
                cx + bladeWidth / 2, bladeBottom), paint)
            canvas.restore()
        }
        canvas.restore()
        paint.color = Color.argb(190, 170, 123, 47)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 3f
        canvas.drawCircle(cx, cy, size * .475f, paint)
        paint.strokeWidth = 1f
        paint.color = Color.argb(70, 167, 119, 46)
        listOf(.37f, .27f).forEach { canvas.drawCircle(cx, cy, size * it, paint) }
        paint.style = Paint.Style.FILL
        paint.alpha = 255
        val hub = asset(context, if (kind == "xuelang") "xuelang-hub.png" else "hub-new.png")
        val hubHalf = size * if (kind == "xuelang") .11f else .14f
        drawContained(canvas, hub, RectF(cx - hubHalf, cy - hubHalf, cx + hubHalf, cy + hubHalf), paint)
        canvas.restore()
        canvas.restore()
    }

    private fun drawContained(canvas: Canvas, image: Bitmap, bounds: RectF, paint: Paint) {
        val scale = min(bounds.width() / image.width, bounds.height() / image.height)
        val width = image.width * scale
        val height = image.height * scale
        canvas.drawBitmap(image, null, RectF(bounds.centerX() - width / 2f, bounds.centerY() - height / 2f,
            bounds.centerX() + width / 2f, bounds.centerY() + height / 2f), paint)
    }
}

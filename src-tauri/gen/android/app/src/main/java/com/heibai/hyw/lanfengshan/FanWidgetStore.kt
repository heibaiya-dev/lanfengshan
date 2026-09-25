package com.heibai.hyw.lanfengshan

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import org.json.JSONArray

data class FanWidgetTrack(val id: String, val label: String, val file: String, val brand: String)
data class FanWidgetState(
    val kind: String,
    val audioId: String,
    val running: Boolean = false,
    val muted: Boolean = false,
    val speed: Int = 1,
    val oscillating: Boolean = false,
)

object FanWidgetCatalog {
    private var cached: List<FanWidgetTrack>? = null

    fun tracks(context: Context, kind: String): List<FanWidgetTrack> {
        val all = cached ?: run {
            val data = context.assets.open("widget/catalog.json").bufferedReader().use { JSONArray(it.readText()) }
            (0 until data.length()).map { index ->
                val item = data.getJSONObject(index)
                FanWidgetTrack(item.getString("id"), item.getString("label"), item.getString("file"), item.getString("brand"))
            }.also { cached = it }
        }
        return all.filter { it.brand == if (kind == "duet") "chorus" else kind }
    }

    fun track(context: Context, state: FanWidgetState): FanWidgetTrack {
        val tracks = tracks(context, state.kind)
        return tracks.firstOrNull { it.id == state.audioId } ?: tracks.first()
    }
}

object FanWidgetStore {
    val kinds = listOf("lanfeng", "xuelang", "duet")
    private fun preferences(context: Context) = context.getSharedPreferences("native_fan_widgets", Context.MODE_PRIVATE)

    fun provider(context: Context, kind: String): ComponentName = ComponentName(context, when (kind) {
        "xuelang" -> XuelangWidgetProvider::class.java
        "duet" -> DuetWidgetProvider::class.java
        else -> LanfengWidgetProvider::class.java
    })

    fun title(kind: String): String = when (kind) {
        "xuelang" -> "雪狼牌电风扇"
        "duet" -> "岚峰 + 雪狼双风扇"
        else -> "岚峰牌电风扇"
    }

    fun kind(context: Context, id: Int): String? {
        val info = AppWidgetManager.getInstance(context).getAppWidgetInfo(id) ?: return null
        return kinds.firstOrNull { provider(context, it) == info.provider }
    }

    fun exists(context: Context, id: Int): Boolean = kind(context, id) != null

    fun allIds(context: Context): List<Int> {
        val manager = AppWidgetManager.getInstance(context)
        return kinds.flatMap { manager.getAppWidgetIds(provider(context, it)).toList() }
    }

    fun read(context: Context, id: Int, kind: String? = null): FanWidgetState {
        val prefs = preferences(context)
        val brand = kind ?: FanWidgetStore.kind(context, id) ?: prefs.getString("$id.kind", "lanfeng")!!
        val audioId = prefs.getString("$id.audio", null)
        val allowed = FanWidgetCatalog.tracks(context, brand)
        return FanWidgetState(
            brand,
            allowed.firstOrNull { it.id == audioId }?.id ?: allowed.first().id,
            prefs.getBoolean("$id.running", false),
            prefs.getBoolean("$id.muted", false),
            prefs.getInt("$id.speed", 1).coerceIn(1, 3),
            prefs.getBoolean("$id.oscillating", false),
        )
    }

    fun write(context: Context, id: Int, state: FanWidgetState) {
        preferences(context).edit()
            .putString("$id.kind", state.kind).putString("$id.audio", state.audioId)
            .putBoolean("$id.running", state.running).putBoolean("$id.muted", state.muted)
            .putInt("$id.speed", state.speed).putBoolean("$id.oscillating", state.oscillating).apply()
    }

    fun delete(context: Context, id: Int) {
        val editor = preferences(context).edit()
        listOf("kind", "audio", "running", "muted", "speed", "oscillating").forEach { editor.remove("$id.$it") }
        editor.apply()
    }
}

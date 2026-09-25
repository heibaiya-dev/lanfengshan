package com.heibai.hyw.lanfengshan

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle

open class FanWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            val state = FanWidgetStore.read(context, id)
            FanWidgetStore.write(context, id, state)
            FanWidgetRenderer.update(context, id)
        }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        FanWidgetRenderer.update(context, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action ?: return
        if (action !in setOf(ACTION_POWER, ACTION_SPEED, ACTION_MUTE, ACTION_OSCILLATE)) return
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (!FanWidgetStore.exists(context, id)) return
        val state = FanWidgetStore.read(context, id)
        val updated = when (action) {
            ACTION_POWER -> state.copy(running = !state.running)
            ACTION_SPEED -> state.copy(speed = state.speed % 3 + 1)
            ACTION_MUTE -> state.copy(muted = !state.muted)
            else -> state.copy(oscillating = !state.oscillating)
        }
        FanWidgetStore.write(context, id, updated)
        FanWidgetAudioService.sync(context, id)
        FanWidgetRenderer.update(context, id)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        ids.forEach { id ->
            FanWidgetStore.delete(context, id)
            FanWidgetAudioService.stopWidget(context, id)
        }
    }

    override fun onRestored(context: Context, oldIds: IntArray, newIds: IntArray) {
        oldIds.zip(newIds).forEach { (oldId, newId) ->
            val state = FanWidgetStore.read(context, oldId)
            FanWidgetStore.write(context, newId, state.copy(running = false))
            FanWidgetStore.delete(context, oldId)
            FanWidgetRenderer.update(context, newId)
        }
    }

    companion object {
        const val ACTION_POWER = "com.heibai.hyw.lanfengshan.widget.POWER"
        const val ACTION_SPEED = "com.heibai.hyw.lanfengshan.widget.SPEED"
        const val ACTION_MUTE = "com.heibai.hyw.lanfengshan.widget.MUTE"
        const val ACTION_OSCILLATE = "com.heibai.hyw.lanfengshan.widget.OSCILLATE"
    }
}

class LanfengWidgetProvider : FanWidgetProvider()
class XuelangWidgetProvider : FanWidgetProvider()
class DuetWidgetProvider : FanWidgetProvider()

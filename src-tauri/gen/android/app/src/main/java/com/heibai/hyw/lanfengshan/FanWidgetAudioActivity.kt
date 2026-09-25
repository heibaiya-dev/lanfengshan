package com.heibai.hyw.lanfengshan

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.os.Bundle

/** Each picker is addressed to one widget and only exposes that widget's catalog. */
class FanWidgetAudioActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (!FanWidgetStore.exists(this, id)) { finish(); return }
        val state = FanWidgetStore.read(this, id)
        val tracks = FanWidgetCatalog.tracks(this, state.kind)
        AlertDialog.Builder(this)
            .setTitle("${FanWidgetStore.title(state.kind)} · 选择音频")
            .setSingleChoiceItems(tracks.map { it.label }.toTypedArray(), tracks.indexOfFirst { it.id == state.audioId }) { dialog, index ->
                if (FanWidgetStore.exists(this, id)) {
                    val current = FanWidgetStore.read(this, id)
                    FanWidgetStore.write(this, id, current.copy(audioId = tracks[index].id))
                    FanWidgetAudioService.sync(this, id)
                    FanWidgetRenderer.update(this, id)
                }
                dialog.dismiss()
                finish()
            }
            .setNegativeButton("取消") { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }
}

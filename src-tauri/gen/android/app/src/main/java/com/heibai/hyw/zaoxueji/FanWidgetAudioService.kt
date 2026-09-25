package com.heibai.hyw.zaoxueji

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

class FanWidgetAudioService : Service() {
    private class Playback(val player: MediaPlayer, val audioId: String, val kind: String) {
        var prepared = false
        var angle = 0f
    }

    private val handler = Handler(Looper.getMainLooper())
    private val players = mutableMapOf<Int, Playback>()
    private val cues = mutableMapOf<Int, MutableSet<MediaPlayer>>()
    private var foregroundStarted = false
    private var lastStartId = 0
    private var hasAudioFocus = false
    private var ducked = false
    private var focusRequest: AudioFocusRequest? = null
    private val audioManager by lazy { getSystemService(AUDIO_SERVICE) as AudioManager }
    private val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        runOnMain {
            when (change) {
                AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> stopAll()
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                    ducked = true
                    updateVolumes()
                }
                AudioManager.AUDIOFOCUS_GAIN -> {
                    ducked = false
                    updateVolumes()
                }
            }
        }
    }

    private val animation = object : Runnable {
        override fun run() {
            for ((id, playback) in players.toMap()) {
                if (!FanWidgetStore.exists(this@FanWidgetAudioService, id)) {
                    releasePlayer(id)
                    continue
                }
                val state = FanWidgetStore.read(this@FanWidgetAudioService, id)
                if (!state.running) {
                    releasePlayer(id)
                    render(id)
                    continue
                }
                if (playback.prepared) {
                    playback.angle = (playback.angle + 48f * state.speed.coerceIn(1, 3)) % 360f
                    render(id, playback.angle)
                }
            }
            if (players.isEmpty()) stopIfIdle() else handler.postDelayed(this, 500L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        activeService = this
        ensureForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStartId = startId
        activeService = this
        when (intent?.action) {
            ACTION_SYNC -> {
                val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
                if (id != AppWidgetManager.INVALID_APPWIDGET_ID) syncPlayer(id) else stopIfIdle()
            }
            ACTION_STOP_ALL -> stopAll(playStopSound = true)
            else -> stopIfIdle()
        }
        // Playback is only started by an explicit widget action, never by service restoration.
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun syncPlayer(id: Int) {
        if (!FanWidgetStore.exists(this, id) || !FanWidgetStore.read(this, id).running) {
            stopOne(id, playStopSound = FanWidgetStore.exists(this, id))
            return
        }
        val state = FanWidgetStore.read(this, id)
        try {
            ensureForeground()
            if (!requestAudioFocus()) {
                stopOne(id)
                return
            }
            val track = FanWidgetCatalog.track(this, state)
            val current = players[id]
            if (current?.audioId == track.id) {
                setVolume(current, state)
                updateCueVolumes(id, state)
                render(id, current.angle)
                return
            }
            releasePlayer(id)
            val playback = Playback(MediaPlayer(), track.id, state.kind)
            players[id] = playback
            playback.player.apply {
                setAudioAttributes(audioAttributes)
                isLooping = true
                setVolume(playback, state)
                setOnPreparedListener { player ->
                    if (players[id] !== playback) return@setOnPreparedListener
                    if (!FanWidgetStore.exists(this@FanWidgetAudioService, id)) {
                        stopOne(id)
                        return@setOnPreparedListener
                    }
                    val latest = FanWidgetStore.read(this@FanWidgetAudioService, id)
                    if (!latest.running || latest.audioId != playback.audioId) {
                        syncPlayer(id)
                        return@setOnPreparedListener
                    }
                    try {
                        setVolume(playback, latest)
                        player.start()
                        playback.prepared = true
                        scheduleAnimation()
                    } catch (error: RuntimeException) {
                        Log.w(TAG, "Unable to start widget $id playback", error)
                        stopOne(id)
                    }
                }
                setOnErrorListener { _, what, extra ->
                    Log.w(TAG, "Widget $id playback error: $what/$extra")
                    if (players[id] === playback) stopOne(id)
                    true
                }
                assets.openFd("widget/audio/${track.file}").use { descriptor ->
                    setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
                }
                prepareAsync()
            }
            if (current == null) {
                releaseCues(id)
                playCues(id, state.kind, starting = true)
            }
            scheduleAnimation()
        } catch (error: Exception) {
            Log.w(TAG, "Unable to prepare widget $id playback", error)
            stopOne(id)
        }
    }

    private fun setVolume(playback: Playback, state: FanWidgetState) {
        val volume = volumeFor(state)
        playback.player.setVolume(volume, volume)
    }

    private fun volumeFor(state: FanWidgetState) = if (state.muted) 0f else if (ducked) 0.2f else 1f

    private fun updateCueVolumes(id: Int, state: FanWidgetState) {
        val volume = volumeFor(state)
        cues[id]?.forEach { it.setVolume(volume, volume) }
    }

    private fun updateVolumes() {
        for ((id, playback) in players) {
            if (FanWidgetStore.exists(this, id)) setVolume(playback, FanWidgetStore.read(this, id))
        }
        for (id in cues.keys) {
            if (FanWidgetStore.exists(this, id)) updateCueVolumes(id, FanWidgetStore.read(this, id))
        }
    }

    private fun playCues(id: Int, kind: String, starting: Boolean) {
        if (!FanWidgetStore.exists(this, id)) return
        val suffix = if (starting) "start.mp3" else "stop.mp3"
        val files = when (kind) {
            "xuelang" -> listOf("xuelang-$suffix")
            "duet" -> listOf(suffix, "xuelang-$suffix")
            else -> listOf(suffix)
        }
        val widgetCues = cues.getOrPut(id) { mutableSetOf() }
        for (file in files) {
            val player = MediaPlayer()
            widgetCues.add(player)
            try {
                player.setAudioAttributes(audioAttributes)
                val volume = volumeFor(FanWidgetStore.read(this, id))
                player.setVolume(volume, volume)
                player.setOnPreparedListener {
                    if (cues[id]?.contains(player) != true) return@setOnPreparedListener
                    try {
                        player.start()
                    } catch (error: RuntimeException) {
                        Log.w(TAG, "Unable to play widget $id cue", error)
                        finishCue(id, player)
                    }
                }
                player.setOnCompletionListener { finishCue(id, player) }
                player.setOnErrorListener { _, _, _ ->
                    finishCue(id, player)
                    true
                }
                assets.openFd("widget/audio/$file").use { descriptor ->
                    player.setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
                }
                player.prepareAsync()
            } catch (error: Exception) {
                Log.w(TAG, "Unable to prepare widget $id cue $file", error)
                widgetCues.remove(player)
                player.release()
            }
        }
        if (widgetCues.isEmpty()) cues.remove(id)
    }

    private fun finishCue(id: Int, player: MediaPlayer) {
        val widgetCues = cues[id] ?: return
        if (!widgetCues.remove(player)) return
        player.setOnPreparedListener(null)
        player.setOnCompletionListener(null)
        player.setOnErrorListener(null)
        player.release()
        if (widgetCues.isEmpty()) cues.remove(id)
        stopIfIdle()
    }

    private fun releaseCues(id: Int) {
        cues.remove(id)?.forEach { player ->
            player.setOnPreparedListener(null)
            player.setOnCompletionListener(null)
            player.setOnErrorListener(null)
            player.release()
        }
    }

    private fun scheduleAnimation() {
        handler.removeCallbacks(animation)
        handler.postDelayed(animation, 500L)
    }

    private fun render(id: Int, angle: Float = 0f) {
        if (!FanWidgetStore.exists(this, id)) return
        try {
            FanWidgetRenderer.update(this, id, angle)
        } catch (error: RuntimeException) {
            Log.w(TAG, "Unable to update widget $id", error)
        }
    }

    private fun releasePlayer(id: Int) {
        players.remove(id)?.player?.apply {
            setOnPreparedListener(null)
            setOnErrorListener(null)
            release()
        }
    }

    private fun stopOne(id: Int, playStopSound: Boolean = false) {
        val kind = players[id]?.kind
        releasePlayer(id)
        releaseCues(id)
        markStopped(this, id)
        render(id)
        if (playStopSound && kind != null) playCues(id, kind, starting = false)
        stopIfIdle()
    }

    private fun stopAll(playStopSound: Boolean = false) {
        val ids = (FanWidgetStore.allIds(this) + players.keys + cues.keys).toSet()
        for (id in ids) {
            val kind = players[id]?.kind
            releasePlayer(id)
            releaseCues(id)
            markStopped(this, id)
            render(id)
            if (playStopSound && kind != null) playCues(id, kind, starting = false)
        }
        stopIfIdle()
    }

    private fun stopIfIdle() {
        if (players.isNotEmpty()) return
        handler.removeCallbacks(animation)
        if (cues.isNotEmpty()) return
        abandonAudioFocus()
        if (foregroundStarted) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            foregroundStarted = false
        }
        if (activeService === this) activeService = null
        if (lastStartId == 0) stopSelf() else stopSelfResult(lastStartId)
    }

    private fun requestAudioFocus(): Boolean {
        if (hasAudioFocus) return true
        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(audioAttributes)
                .setOnAudioFocusChangeListener(focusListener, handler)
                .build()
            focusRequest = request
            audioManager.requestAudioFocus(request)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }
        hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return hasAudioFocus
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            focusRequest = null
        } else if (hasAudioFocus) {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(focusListener)
        }
        hasAudioFocus = false
        ducked = false
    }

    private fun ensureForeground() {
        if (foregroundStarted) return
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "桌面小组件播放", NotificationManager.IMPORTANCE_LOW).apply {
                description = "控制桌面小组件的音频播放"
                setShowBadge(false)
            })
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val stopIntent = PendingIntent.getService(this, 0,
            Intent(this, FanWidgetAudioService::class.java).setAction(ACTION_STOP_ALL),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        builder.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("造雪机")
            .setContentText("造雪机小组件运行中")
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .addAction(Notification.Action.Builder(android.R.drawable.ic_media_pause, "全部停止", stopIntent).build())
        packageManager.getLaunchIntentForPackage(packageName)?.let { launchIntent ->
            builder.setContentIntent(PendingIntent.getActivity(this, 1, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, builder.build())
        }
        foregroundStarted = true
    }

    private fun runOnMain(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) action() else handler.post { action() }
    }

    override fun onDestroy() {
        if (activeService === this) activeService = null
        handler.removeCallbacksAndMessages(null)
        for (id in players.keys.toList()) {
            releasePlayer(id)
            markStopped(this, id)
            render(id)
        }
        for (id in cues.keys.toList()) releaseCues(id)
        abandonAudioFocus()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "FanWidgetAudio"
        private const val CHANNEL_ID = "fan_widget_audio"
        private const val NOTIFICATION_ID = 1101
        private const val ACTION_SYNC = "com.heibai.hyw.zaoxueji.widget.SYNC_AUDIO"
        private const val ACTION_STOP_ALL = "com.heibai.hyw.zaoxueji.widget.STOP_ALL"
        @Volatile private var activeService: FanWidgetAudioService? = null

        fun sync(context: Context, id: Int) {
            val appContext = context.applicationContext
            if (!FanWidgetStore.exists(appContext, id)) {
                stopWidget(appContext, id)
                return
            }
            if (!FanWidgetStore.read(appContext, id).running) {
                activeService?.let { service -> service.runOnMain { service.stopOne(id, playStopSound = true) } }
                return
            }
            val intent = Intent(appContext, FanWidgetAudioService::class.java)
                .setAction(ACTION_SYNC)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) appContext.startForegroundService(intent)
                else appContext.startService(intent)
            } catch (error: RuntimeException) {
                Log.w(TAG, "Unable to start widget $id service", error)
                stopWidget(appContext, id)
                markStopped(appContext, id)
                if (FanWidgetStore.exists(appContext, id)) FanWidgetRenderer.update(appContext, id)
            }
        }

        fun stopWidget(context: Context, id: Int) {
            activeService?.let { service ->
                service.runOnMain {
                    service.releasePlayer(id)
                    service.releaseCues(id)
                    service.stopIfIdle()
                }
            }
        }

        private fun markStopped(context: Context, id: Int) {
            if (!FanWidgetStore.exists(context, id)) return
            val state = FanWidgetStore.read(context, id)
            if (state.running) FanWidgetStore.write(context, id, state.copy(running = false))
        }
    }
}

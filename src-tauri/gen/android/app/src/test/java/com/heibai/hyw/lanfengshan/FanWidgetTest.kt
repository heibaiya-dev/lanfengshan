package com.heibai.hyw.lanfengshan

import android.content.Context
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class FanWidgetTest {
    private val context: Context get() = RuntimeEnvironment.getApplication()

    @Before fun clearState() {
        context.getSharedPreferences("native_fan_widgets", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test fun eachBrandHasAnIndependentSystemProvider() {
        val providers = FanWidgetStore.kinds.map { FanWidgetStore.provider(context, it).className }
        assertEquals(3, providers.toSet().size)
        assertEquals(LanfengWidgetProvider::class.java.name, providers[0])
        assertEquals(XuelangWidgetProvider::class.java.name, providers[1])
        assertEquals(DuetWidgetProvider::class.java.name, providers[2])
    }

    @Test fun twoWidgetsKeepIndependentAudioAndControls() {
        val first = FanWidgetStore.read(context, 101, "lanfeng")
        val second = FanWidgetStore.read(context, 102, "xuelang")
        FanWidgetStore.write(context, 101, first.copy(running = true, speed = 3, muted = true))
        FanWidgetStore.write(context, 102, second.copy(oscillating = true))
        val savedFirst = FanWidgetStore.read(context, 101, "lanfeng")
        val savedSecond = FanWidgetStore.read(context, 102, "xuelang")
        assertTrue(savedFirst.running)
        assertEquals(3, savedFirst.speed)
        assertTrue(savedFirst.muted)
        assertFalse(savedSecond.running)
        assertEquals(1, savedSecond.speed)
        assertFalse(savedSecond.muted)
        assertTrue(savedSecond.oscillating)
        assertNotEquals(savedFirst.audioId, savedSecond.audioId)
    }

    @Test fun catalogFiltersExclusiveAndChorusAudio() {
        for ((kind, brand) in listOf("lanfeng" to "lanfeng", "xuelang" to "xuelang", "duet" to "chorus")) {
            val tracks = FanWidgetCatalog.tracks(context, kind)
            assertTrue(tracks.isNotEmpty())
            assertTrue(tracks.all { it.brand == brand })
            tracks.forEach { track -> context.assets.openFd("widget/audio/${track.file}").use { assertTrue(it.length > 0L) } }
        }
    }

    @Test fun foreignSongIsRejectedWhenRestoringWidgetState() {
        val foreignSong = FanWidgetCatalog.tracks(context, "xuelang").first().id
        FanWidgetStore.write(context, 103, FanWidgetState("lanfeng", foreignSong))
        val restored = FanWidgetStore.read(context, 103, "lanfeng")
        assertNotEquals(foreignSong, restored.audioId)
        assertEquals("lanfeng", FanWidgetCatalog.track(context, restored).brand)
    }

    @Test fun deletingOneWidgetClearsOnlyItsState() {
        FanWidgetStore.write(context, 104, FanWidgetStore.read(context, 104, "lanfeng").copy(running = true, muted = true))
        FanWidgetStore.write(context, 105, FanWidgetStore.read(context, 105, "duet").copy(speed = 3))
        FanWidgetStore.delete(context, 104)
        assertFalse(context.getSharedPreferences("native_fan_widgets", Context.MODE_PRIVATE).contains("104.audio"))
        assertFalse(FanWidgetStore.read(context, 104, "lanfeng").running)
        assertFalse(FanWidgetStore.read(context, 104, "lanfeng").muted)
        assertEquals(3, FanWidgetStore.read(context, 105, "duet").speed)
    }
}

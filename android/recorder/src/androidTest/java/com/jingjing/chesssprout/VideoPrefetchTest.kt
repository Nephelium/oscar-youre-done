package com.jingjing.chesssprout

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class VideoPrefetchTest {
    @Test fun lookaheadPreservesEveryTimestampAndPixel() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val uri=Uri.fromFile(File(context.getExternalFilesDir(null),"regression-video.mp4"))
        VideoFrameReader(context,uri,4100).use {serial->
            PrefetchedVideoReader(context,uri,4100).use {ahead->
                repeat(20) {
                    val expected=serial.next{false}!!;val actual=ahead.next{false}!!
                    try {assertEquals(expected.timeMs,actual.timeMs);assertTrue(expected.bitmap.sameAs(actual.bitmap))}
                    finally{expected.bitmap.recycle();actual.bitmap.recycle()}
                }
                Thread.sleep(150)
                assertTrue("Only a queued frame and one in flight",ahead.convertedFrames<=22)
            }
        }
        assertFalse(Thread.getAllStackTraces().keys.any{it.name=="chesssprout-decode" && it.isAlive})
    }
    @Test fun cancellationAndOpenErrorsReleaseDecoderThread() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val uri=Uri.fromFile(File(context.getExternalFilesDir(null),"regression-video.mp4"))
        PrefetchedVideoReader(context,uri,4100).use {reader->assertNull(reader.next{true})}
        PrefetchedVideoReader(context,Uri.fromFile(File(context.filesDir,"missing-test-video.mp4")),0).use {reader->
            var failed=false
            try{reader.next{false}}catch(_: Exception){failed=true}
            assertTrue("Error reaches importer fallback",failed)
        }
        assertFalse(Thread.getAllStackTraces().keys.any{it.name=="chesssprout-decode" && it.isAlive})
    }
}

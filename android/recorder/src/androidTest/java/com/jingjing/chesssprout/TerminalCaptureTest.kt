package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class TerminalCaptureTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private fun frame(name: String): Bitmap {
        val full=instrumentation.context.assets.open(name).use{BitmapFactory.decodeStream(it)}
        val scaled=Bitmap.createScaledBitmap(full,720,(full.height*720f/full.width).toInt(),true)
        if(scaled!==full)full.recycle()
        return scaled
    }

    @Test fun recordedMateIgnoresResultScreenAndFinishIsIdempotent() {
        val pipeline=CapturePipeline(instrumentation.targetContext,JSONObject(),"终局回归")
        val initial=frame("duolingo-auto-initial.png")
        repeat(4){pipeline.process(initial)}
        val reference=instrumentation.context.assets.open("duolingo-reference.json").bufferedReader().use{JSONObject(it.readText())}
        val moves=reference.getJSONArray("moves")
        val frames=reference.getJSONArray("frames")
        for(i in 0 until frames.length()) {
            val image=frame(frames.getJSONObject(i).getString("image"))
            repeat(3){pipeline.process(image)};image.recycle()
        }
        assertTrue(pipeline.tracker.board.isMated)
        assertEquals(moves.length(),pipeline.tracker.moves.size)
        val existing=pipeline.game.getJSONArray("issues").toString()
        // A new initial board is a plausible but unrelated result-page image.
        // It must not undo the completed game's moves or create another gap.
        repeat(20){pipeline.process(initial)}
        val blank=Bitmap.createBitmap(initial.width,initial.height,Bitmap.Config.ARGB_8888)
        repeat(20){pipeline.process(blank)}
        assertEquals(moves.length(),pipeline.tracker.moves.size)
        assertEquals(existing,pipeline.game.getJSONArray("issues").toString())
        pipeline.finish();val saved=pipeline.game.toString();pipeline.finish()
        assertEquals(saved,pipeline.game.toString());assertEquals("1-0",pipeline.game.getString("result"))
        blank.recycle();initial.recycle()
    }

    @Test fun unfinishedCaptureRetainsTypedTailWarning() {
        val pipeline=CapturePipeline(instrumentation.targetContext,JSONObject(),"未完成终局回归")
        val initial=frame("duolingo-auto-initial.png")
        repeat(4){pipeline.process(initial)}
        val blank=Bitmap.createBitmap(initial.width,initial.height,Bitmap.Config.ARGB_8888).apply{eraseColor(android.graphics.Color.WHITE)}
        repeat(20){pipeline.process(blank)};pipeline.finish()
        val issues=pipeline.game.getJSONArray("issues")
        assertTrue((0 until issues.length()).any{issues.getJSONObject(it).optString("kind")=="unconfirmed-tail"})
        val count=issues.length();pipeline.finish();assertEquals(count,issues.length())
        blank.recycle();initial.recycle()
    }
}

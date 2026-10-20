package com.jingjing.chesssprout

import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.zip.GZIPOutputStream
import com.github.bhlangonijr.chesslib.Board

/** Local acceptance fixtures are supplied separately; phone screenshots are never packaged. */
@RunWith(AndroidJUnit4::class)
class AppearanceVisionTest {
    @Test fun exportNightProfileAndCheckOfficialDay() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val directory=context.getExternalFilesDir(null)!!
        val night=BitmapFactory.decodeFile(File(directory,"official-night.jpg").absolutePath)
        requireNotNull(night){"Provide the private official-night.jpg fixture in external files"}
        val recognizer=BoardRecognizer()
        assertTrue(recognizer.loadProfile(ThemeStore(context).bundled()!!))
        assertEquals("Bundled night profile",Board().fen.substringBefore(' '),recognizer.recognize(night)?.placement)
        assertTrue("Night board must calibrate",recognizer.calibrate(night))
        assertFalse("White pieces are at the bottom",recognizer.blackBottom)
        assertEquals(Board().fen.substringBefore(' '),recognizer.recognize(night)?.placement)
        File(directory,"verified-night-profile.json.gz").outputStream().use { output->
            GZIPOutputStream(output).use{it.write(recognizer.profile().toString().toByteArray())}
        }
        val region=recognizer.region!!
        fun cell(row: Int,col: Int)=Rect(
            ((region.left+col*region.width()/8)*night.width).toInt(),
            ((region.top+row*region.height()/8)*night.height).toInt(),
            ((region.left+(col+1)*region.width()/8)*night.width).toInt(),
            ((region.top+(row+1)*region.height()/8)*night.height).toInt())
        val moved=night.copy(Bitmap.Config.ARGB_8888,true)
        Canvas(moved).apply{
            drawBitmap(night,cell(6,4),cell(4,4),null)
            drawBitmap(night,cell(2,4),cell(6,4),null)
        }
        assertEquals("Night e4", "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR",recognizer.recognize(moved)?.placement)
        val pipeline=CapturePipeline(context,org.json.JSONObject().put("side","w"),"日夜识别回归")
        repeat(3){pipeline.process(night)}
        repeat(3){pipeline.process(moved)}
        assertEquals(listOf("e2e4"),pipeline.tracker.moves)
        pipeline.finish()
        moved.recycle()
        val day=BitmapFactory.decodeFile(File(directory,"official-day.jpg").absolutePath)
        requireNotNull(day){"Provide the private official-day.jpg fixture in external files"}
        val dayRecognizer=BoardRecognizer(true)
        assertTrue(dayRecognizer.loadProfile(ThemeStore(context).bundled()!!))
        assertEquals("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR",dayRecognizer.recognize(day)?.placement)
        dayRecognizer.blackBottom=false;dayRecognizer.region=null
        assertEquals("Switch to night without recalibration",Board().fen.substringBefore(' '),dayRecognizer.recognize(night)?.placement)
        val reload=BoardRecognizer()
        assertTrue(reload.loadProfile(ThemeStore(context).load()!!))
        assertEquals("Saved calibration retains night",Board().fen.substringBefore(' '),reload.recognize(night)?.placement)
        night.recycle()
        day.recycle()
    }
}

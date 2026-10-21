package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.github.bhlangonijr.chesslib.Board
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class CapturePerformanceTest {
    @Test fun disappearingBoardDoesNotCreateAnEmptyPositionIssue() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val initial=instrumentation.context.assets.open("duolingo-auto-initial.png").use{BitmapFactory.decodeStream(it)}
        val blank=Bitmap.createBitmap(initial.width,initial.height,Bitmap.Config.ARGB_8888).apply{eraseColor(android.graphics.Color.WHITE)}
        val pipeline=CapturePipeline(instrumentation.targetContext,JSONObject(),"棋盘退场回归")
        repeat(4){pipeline.process(initial)}
        assertEquals("8/8/8/8/8/8/8/8",pipeline.recognizer.recognize(blank)?.placement)
        repeat(6){pipeline.process(blank)}
        assertTrue(pipeline.tracker.moves.isEmpty())
        assertEquals(0,pipeline.game.getJSONArray("issues").length())
        repeat(2){pipeline.process(initial)}
        pipeline.finish()
        assertEquals(0,pipeline.game.getJSONArray("issues").length())
        blank.recycle();initial.recycle()
    }
    @Test fun blankSwitchFrameDoesNotConsumeInitialCalibration() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val initial=instrumentation.context.assets.open("duolingo-auto-initial.png").use{BitmapFactory.decodeStream(it)}
        val blank=Bitmap.createBitmap(initial.width,initial.height,Bitmap.Config.ARGB_8888)
        val expected=BoardRecognizer();assertTrue(expected.calibrate(initial))
        val pipeline=CapturePipeline(instrumentation.targetContext,JSONObject(),"切换应用首帧回归")
        pipeline.process(blank)
        repeat(4){pipeline.process(initial)}
        val wanted=expected.profile().getJSONObject("templates")
        val actual=pipeline.recognizer.profile().getJSONObject("templates")
        for(piece in ".prnbqkPRNBQK")assertEquals("Relearn $piece after blank first frame",wanted.getJSONArray(piece.toString()).toString(),actual.getJSONArray(piece.toString()).toString())
        assertTrue(pipeline.tracker.moves.isEmpty())
        assertEquals(0,pipeline.game.getJSONArray("issues").length())
        blank.recycle();initial.recycle();pipeline.finish()
    }
    @Test fun selectingQueenAndShowingLegalDotsDoesNotRecordAMove() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val directory=context.getExternalFilesDir(null)!!
        val line=listOf("e2e4","e7e6","d2d4","d7d5","e4d5","e6d5","f1b5","c7c6","d1e2","f8e7","b5a4")
        val fen=CaptureTracker(moves=line).board.fen
        val pipeline=CapturePipeline(context,JSONObject().put("initialFen",fen).put("side","b"),"选中棋子回归")
        for(name in listOf("unselected-queen.png","selected-queen.png","unselected-queen.png")) {
            val full=BitmapFactory.decodeFile(File(directory,name).absolutePath)
            requireNotNull(full){"Provide local $name fixture"}
            val frame=Bitmap.createScaledBitmap(full,720,full.height*720/full.width,true)
            repeat(6){pipeline.process(frame)}
            assertTrue(name,pipeline.tracker.moves.isEmpty())
            assertEquals(name,0,pipeline.game.getJSONArray("issues").length())
            if(frame!==full)frame.recycle();full.recycle()
        }
        pipeline.finish()
    }
    @Test fun longGapKeepsOldMovesAndContinuesInLinkedSegment() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val pipeline=CapturePipeline(instrumentation.targetContext,JSONObject(),"长缺口续录回归")
        fun feed(name: String) {
            val full=instrumentation.context.assets.open(name).use{BitmapFactory.decodeStream(it)}
            val frame=Bitmap.createScaledBitmap(full,720,full.height*720/full.width,true)
            repeat(5){pipeline.process(frame)}
            if(frame!==full)frame.recycle();full.recycle()
        }
        feed("duolingo-auto-initial.png");feed("duolingo-game-01.png")
        val original=pipeline.game.getString("id")
        assertEquals(2,pipeline.tracker.moves.size)
        feed("duolingo-game-11.png");feed("duolingo-game-12.png")
        assertNotEquals(original,pipeline.game.getString("id"))
        assertEquals(listOf("g5e6","d4e6"),pipeline.tracker.moves)
        assertEquals(original,pipeline.game.getJSONObject("capture").getString("previousId"))
        val old=GameStore(instrumentation.targetContext).read(original)!!
        assertEquals(2,old.getJSONArray("moves").length())
        assertEquals(pipeline.game.getString("id"),old.getJSONObject("capture").getString("nextId"))
        feed("duolingo-game-13.png")
        assertEquals(listOf("g5e6","d4e6","d2d4","h7h6"),pipeline.tracker.moves)
        assertEquals(6,pipeline.confirmedPlies)
        pipeline.finish()
    }
    @Test fun staticBoardIsReusedButMovesRollbackAndGradualChangeAreObserved() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        fun frame(name: String)=instrumentation.context.assets.open(name).use{BitmapFactory.decodeStream(it)}
        val initial=frame("duolingo-auto-initial.png")
        val recognizer=BoardRecognizer();assertTrue(recognizer.calibrate(initial))
        val first=recognizer.recognize(initial)!!
        repeat(6){assertEquals(first,recognizer.recognize(initial))}
        assertEquals(1,recognizer.classifiedFrames);assertEquals(6,recognizer.reusedFrames)
        val outside=initial.copy(Bitmap.Config.ARGB_8888,true)
        android.graphics.Canvas(outside).drawRect(0f,0f,150f,50f,android.graphics.Paint().apply{color=android.graphics.Color.RED})
        assertEquals(first,recognizer.recognize(outside))
        assertEquals(1,recognizer.classifiedFrames)
        val moved=frame("duolingo-game-01.png")
        assertNotEquals(first.placement,recognizer.recognize(moved)?.placement)
        assertEquals(first.placement,recognizer.recognize(initial)?.placement)
        val before=recognizer.classifiedFrames
        // Each adjacent frame differs by only one level, but the difference from
        // the last actually classified frame grows. It must not be skipped forever.
        val pixels=IntArray(initial.width*initial.height)
        initial.getPixels(pixels,0,initial.width,0,0,initial.width,initial.height)
        val shifted=initial.copy(Bitmap.Config.ARGB_8888,true)
        for(offset in 1..8) {
            val altered=pixels.map{color->
                (0xff shl 24) or (((color shr 16 and 255)-offset).coerceAtLeast(0) shl 16) or
                    (((color shr 8 and 255)-offset).coerceAtLeast(0) shl 8) or ((color and 255)-offset).coerceAtLeast(0)
            }.toIntArray()
            shifted.setPixels(altered,0,initial.width,0,0,initial.width,initial.height)
            recognizer.recognize(shifted)
        }
        assertTrue("Accumulated differences must trigger classification",recognizer.classifiedFrames>before)
        initial.recycle();outside.recycle();moved.recycle();shifted.recycle()
    }
    @Test fun measureContinuousFramesAndMissingMoves() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val context=instrumentation.targetContext
        fun frame(name: String): Bitmap {
            val source=instrumentation.context.assets.open(name).use{BitmapFactory.decodeStream(it)}
            val scaled=Bitmap.createScaledBitmap(source,720,source.height*720/source.width,true)
            if(source!==scaled)source.recycle()
            return scaled
        }
        val recognizer=BoardRecognizer()
        val initial=frame("duolingo-auto-initial.png")
        assertTrue(recognizer.calibrate(initial));initial.recycle()
        val tracker=CaptureTracker()
        val data=JSONObject(instrumentation.context.assets.open("duolingo-reference.json").bufferedReader().use{it.readText()})
        val timings=JSONArray()
        val frames=data.getJSONArray("frames")
        for(i in 0 until frames.length()) {
            val entry=frames.getJSONObject(i);val bitmap=frame(entry.getString("image"))
            val start=SystemClock.elapsedRealtimeNanos()
            val observation=recognizer.recognize(bitmap)!!
            val detected=SystemClock.elapsedRealtimeNanos()
            val change=tracker.accept(observation.placement)
            val end=SystemClock.elapsedRealtimeNanos()
            assertEquals(entry.toString(),entry.getInt("plies"),tracker.moves.size)
            timings.put(JSONObject().put("frame",entry.getString("image")).put("visionMs",(detected-start)/1e6)
                .put("trackerMs",(end-detected)/1e6).put("kind",change.kind))
            bitmap.recycle()
        }
        val missing=Board().apply{listOf("e4","d5","exd5","Qxd5").forEach{doMove(it)}}.fen.substringBefore(' ')
        val gapTracker=CaptureTracker()
        val gaps=JSONArray()
        repeat(6) {
            val start=SystemClock.elapsedRealtimeNanos()
            val result=gapTracker.accept(missing)
            gaps.put(JSONObject().put("kind",result.kind).put("ms",(SystemClock.elapsedRealtimeNanos()-start)/1e6)
                .put("nodes",gapTracker.lastSearchNodes).put("limited",gapTracker.lastSearchLimited))
        }
        assertEquals(listOf("e2e4","d7d5","e4d5","d8d5"),gapTracker.moves)
        val report=JSONObject().put("frames",timings).put("gap",gaps)
        val name=InstrumentationRegistry.getArguments().getString("reportName")?:"capture-performance.json"
        File(context.getExternalFilesDir(null),name).writeText(report.toString(2))
    }
}

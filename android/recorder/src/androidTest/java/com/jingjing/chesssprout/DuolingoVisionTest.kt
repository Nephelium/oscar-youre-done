package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import com.github.bhlangonijr.chesslib.Board
import com.github.bhlangonijr.chesslib.move.Move
import android.net.Uri
import java.io.File

@RunWith(AndroidJUnit4::class)
class DuolingoVisionTest {
    @Test fun practiceVideoWithLetterboxingAndRollbackStartsFromConfirmedPosition() {
        val phases=JSONObject()
        var phaseStart=System.nanoTime()
        fun phase(name: String){phases.put(name,(System.nanoTime()-phaseStart)/1e6);phaseStart=System.nanoTime()}
        val context=instrumentation.targetContext
        ThemeStore(context).save(ThemeStore(context).bundled()!!)
        val video=File(context.cacheDir,"practice-rewind-regression.mp4")
        instrumentation.context.assets.open("v121-practice-rewind.mp4").use {input->video.outputStream().use{input.copyTo(it)}}
        VideoImporter.select(context,Uri.fromFile(video))
        phase("selectMs")
        VideoImporter.seek(context,200)
        phase("seekMs")
        val detected=VideoImporter.prepare(context,JSONObject().put("side","w"))
        phase("prepareMs")
        assertEquals("3k4/8/2K5/3P4/8/8/8/8 w - - 0 1",detected.getString("fen"))
        VideoImporter.run(context,JSONObject().put("confirmFen",detected.getString("fen")))
        val until=System.currentTimeMillis()+60_000
        while(VideoImporter.state.optString("state")=="processing" && System.currentTimeMillis()<until)Thread.sleep(100)
        assertEquals(VideoImporter.state.toString(),"done",VideoImporter.state.getString("state"))
        phase("processMs")
        phases.put("state",VideoImporter.state)
        File(context.getExternalFilesDir(null),"video-phases.json").writeText(phases.toString(2))
        val record=GameStore(context).read(VideoImporter.state.getString("gameId"))!!
        assertEquals("practice",record.getString("notebook"))
        val expected=listOf("c6d6","d8c8","d6e7","c8c7","d5d6","c7c8")
        assertEquals(expected,(0 until record.getJSONArray("moves").length()).map{record.getJSONArray("moves").getString(it)})
        assertEquals(1,record.getJSONArray("undoEvents").length())
        assertEquals(4,record.getJSONArray("branches").getJSONObject(0).getJSONArray("moves").length())
        assertEquals(0,record.getJSONArray("issues").length())
    }
    // Synthetic orientation transform of actual screen pixels: keep each piece
    // upright, move the whole cell to the opposing square (not a rotated glyph).
    private fun blackView(bitmap: Bitmap): Bitmap {
        val reference=frame("duolingo-auto-initial.png")
        val locator=BoardRecognizer();assertTrue(locator.calibrate(reference));reference.recycle()
        val box=locator.region!!
        val result=bitmap.copy(Bitmap.Config.ARGB_8888,true);val canvas=android.graphics.Canvas(result)
        for(i in 0..63) {
            fun square(index: Int)=android.graphics.Rect(
                ((box.left+index%8*box.width()/8)*bitmap.width).toInt(),
                ((box.top+index/8*box.height()/8)*bitmap.height).toInt(),
                ((box.left+(index%8+1)*box.width()/8)*bitmap.width).toInt(),
                ((box.top+(index/8+1)*box.height()/8)*bitmap.height).toInt())
            canvas.drawBitmap(bitmap,square(i),square(63-i),null)
        }
        return result
    }
    @Test fun blackBottomCanStartAfterFirstPairWithoutCalibration() {
        val context=instrumentation.targetContext
        val bundled=ThemeStore(context).bundled()!!
        val detector=BoardRecognizer(true);assertTrue(detector.loadProfile(bundled))
        val initial=frame("duolingo-auto-initial.png")
        val flippedInitial=blackView(initial)
        val learned=BoardRecognizer(false);assertTrue(learned.calibrate(flippedInitial))
        assertTrue(learned.blackBottom)
        ThemeStore(context).save(bundled)
        val pipeline=CapturePipeline(context,JSONObject().put("side","b"),"黑方晚起录回归")
        val data=JSONObject(instrumentation.context.assets.open("duolingo-reference.json").bufferedReader().use{it.readText()})
        val frames=data.getJSONArray("frames")
        for(index in 0 until frames.length()) {
            val item=frames.getJSONObject(index);val source=frame(item.getString("image"));val flipped=blackView(source)
            repeat(3){pipeline.process(flipped)}
            assertEquals(item.getString("image"),item.getInt("plies"),pipeline.tracker.moves.size)
            source.recycle();flipped.recycle()
        }
        assertEquals(0,pipeline.game.getJSONArray("issues").length())
        assertEquals("b",pipeline.game.getString("side"))
        initial.recycle();flippedInitial.recycle();pipeline.finish()
    }
    @Test fun bundledProfileRecognizesPracticeAndLongRollbackKeepsAttempt() {
        val context=instrumentation.targetContext
        ThemeStore(context).save(ThemeStore(context).bundled()!!)
        val fen="3k4/8/2K5/3P4/8/8/8/8 w - - 0 1"
        val pipeline=CapturePipeline(context,JSONObject().put("mode","position").put("initialFen",fen),"练习撤回回归")
        frame("duolingo-promotion-live-03.png").also{b->repeat(3){pipeline.process(b)};b.recycle()}
        frame("duolingo-promotion-live-05.png").also{b->repeat(3){pipeline.process(b)};b.recycle()}
        assertEquals(4,pipeline.tracker.moves.size)
        frame("duolingo-promotion-start.png").also{b->repeat(3){pipeline.process(b)};b.recycle()}
        assertEquals(0,pipeline.tracker.moves.size)
        assertEquals(4,pipeline.game.getJSONArray("branches").getJSONObject(0).getJSONArray("moves").length())
        frame("duolingo-promotion-live-03.png").also{b->repeat(3){pipeline.process(b)};b.recycle()}
        assertEquals(2,pipeline.tracker.moves.size)
        assertEquals("practice",pipeline.game.getString("notebook"))
        pipeline.finish()
    }
    @Test fun incorrectSideChoiceMustNotPoisonInitialTemplates() {
        val pipeline=CapturePipeline(instrumentation.targetContext,JSONObject().put("side","b"),"方向回归")
        frame("duolingo-auto-initial.png").also {bitmap->repeat(3){pipeline.process(bitmap)};bitmap.recycle()}
        assertTrue(pipeline.recognizer.calibrated)
        assertFalse("The actual initial board has white at the bottom",pipeline.recognizer.blackBottom)
        val data=JSONObject(instrumentation.context.assets.open("duolingo-reference.json").bufferedReader().use{it.readText()})
        val frames=data.getJSONArray("frames")
        for(index in 0 until frames.length()){
            val item=frames.getJSONObject(index)
            frame(item.getString("image")).also{bitmap->repeat(3){pipeline.process(bitmap)};bitmap.recycle()}
            assertEquals(item.getString("image"),item.getInt("plies"),pipeline.tracker.moves.size)
        }
        assertEquals("w",pipeline.game.getString("side"))
    }
    @Test fun movedBoardMustNotBeLearnedAsInitialPosition() {
        frame("duolingo-game-01.png").also{bitmap->
            assertFalse("Moved pawns must never be labelled as initial empty squares",BoardRecognizer().calibrate(bitmap))
            bitmap.recycle()
        }
    }
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun frame(name: String): Bitmap {
        val full=instrumentation.context.assets.open(name).use {BitmapFactory.decodeStream(it)}
        val result=Bitmap.createScaledBitmap(full,720,(full.height*720f/full.width).toInt(),true)
        if(full!==result)full.recycle();return result
    }
    @Test fun actualDuolingoGameIncludesCastlingCapturesAndExplodingKing() {
        val data=JSONObject(instrumentation.context.assets.open("duolingo-reference.json").bufferedReader().use{it.readText()})
        val pipeline=CapturePipeline(instrumentation.targetContext,JSONObject(),"真实多邻国画面回归")
        frame("duolingo-auto-initial.png").also {bitmap -> repeat(3){pipeline.process(bitmap)};bitmap.recycle()}
        assertTrue("Actual low contrast full-width board must calibrate",pipeline.recognizer.calibrated)
        val expected=data.getJSONArray("frames")
        for(index in 0 until expected.length()) {
            val item=expected.getJSONObject(index)
            frame(item.getString("image")).also {bitmap -> repeat(3){pipeline.process(bitmap)};bitmap.recycle()}
            assertEquals(item.getString("image"),item.getInt("plies"),pipeline.tracker.moves.size)
        }
        val moves=data.getJSONArray("moves");assertEquals((0 until moves.length()).map{moves.getString(it)},pipeline.tracker.moves)
        assertTrue(pipeline.tracker.board.isMated);assertEquals("1-0",pipeline.game.getString("result"))
        assertEquals(0,pipeline.game.getJSONArray("issues").length())
        val restored=BoardRecognizer();assertTrue(restored.loadProfile(ThemeStore(instrumentation.targetContext).load()!!))
        pipeline.finish()
    }
    @Test fun startsFromActualMidgameWithoutRequiringOpeningHistory() {
        val initial=frame("duolingo-auto-initial.png");val learned=BoardRecognizer()
        assertTrue(learned.calibrate(initial));initial.recycle()
        ThemeStore(instrumentation.targetContext).save(learned.profile())
        val pipeline=CapturePipeline(instrumentation.targetContext,JSONObject().put("mode","position"),"真实练习局面回归")
        frame("duolingo-game-10.png").also {bitmap -> repeat(3){pipeline.process(bitmap)};bitmap.recycle()}
        assertNotNull("Arbitrary board must be recognized with learned theme",pipeline.pendingFen)
        assertTrue(pipeline.tracker.moves.isEmpty())
        val fen=pipeline.pendingFen!!
        pipeline.configure(JSONObject().put("confirmFen",fen))
        frame("duolingo-game-11.png").also {bitmap -> repeat(3){pipeline.process(bitmap)};bitmap.recycle()}
        assertEquals(listOf("e6f7","e8d8"),pipeline.tracker.moves)
        assertEquals(fen,pipeline.game.getString("initialFen"))
        assertNull(pipeline.pendingFen)
        pipeline.finish()
    }
    private fun prepareTheme() {
        val initial=frame("duolingo-auto-initial.png");val recognizer=BoardRecognizer()
        assertTrue(recognizer.calibrate(initial));initial.recycle()
        ThemeStore(instrumentation.targetContext).save(recognizer.profile())
    }
    @Test fun exportVerifiedReferenceProfile() {
        val bitmap=frame("duolingo-auto-initial.png")
        val recognizer=BoardRecognizer()
        assertTrue(recognizer.calibrate(bitmap))
        assertEquals(Board().fen.substringBefore(' '),recognizer.recognize(bitmap)!!.placement)
        bitmap.recycle()
        File(instrumentation.targetContext.getExternalFilesDir(null),"verified-board-profile.json.gz").outputStream().use { out ->
            java.util.zip.GZIPOutputStream(out).use { it.write(recognizer.profile().toString().toByteArray()) }
        }
    }
    @Test fun realPromotionChooserAndQueenPromotionAreRecovered() {
        prepareTheme()
        val pipeline=CapturePipeline(instrumentation.targetContext,JSONObject().put("mode","position"),"真实多邻国升变回归")
        frame("duolingo-promotion-start.png").also {bitmap->repeat(3){pipeline.process(bitmap)};bitmap.recycle()}
        assertEquals("3k4/8/2K5/3P4/8/8/8/8 w - - 0 1",pipeline.pendingFen)
        pipeline.configure(JSONObject().put("confirmFen",pipeline.pendingFen))
        for((name,count) in listOf("03" to 2,"05" to 4,"07" to 6,"09" to 8,"11" to 8,"13" to 9)) {
            frame("duolingo-promotion-live-$name.png").also{bitmap->repeat(5){pipeline.process(bitmap)};bitmap.recycle()}
            assertEquals(name,count,pipeline.tracker.moves.size)
        }
        assertEquals(listOf("c6d6","d8c8","d6e7","c8c7","d5d6","c7c8","d6d7","c8c7","d7d8q"),pipeline.tracker.moves)
        val issues=pipeline.game.getJSONArray("issues")
        assertTrue((0 until issues.length()).all{issues.getJSONObject(it).optBoolean("resolved")})
        pipeline.finish()
    }
    @Test fun screenshotImportAndDeletionKeepTheExternalImageAndOtherNotebook() {
        prepareTheme()
        val context=instrumentation.targetContext;val source=File(context.cacheDir,"oscar-screenshot-test.png")
        instrumentation.context.assets.open("duolingo-promotion-start.png").use {input->source.outputStream().use{input.copyTo(it)}}
        val original=source.readBytes()
        ScreenshotImporter.select(context,Uri.fromFile(source))
        val detected=ScreenshotImporter.recognize(context,JSONObject())
        assertEquals("3k4/8/2K5/3P4/8/8/8/8 w - - 0 1",detected.getString("fen"))
        val game=ScreenshotImporter.confirm(context,JSONObject().put("fen",detected.getString("fen")))
        assertEquals("practice",game.getString("notebook"))
        val crop=File(context.filesDir,"evidence/"+game.getJSONObject("capture").getString("image"));assertTrue(crop.isFile)
        val store=GameStore(context);val other=JSONObject(game.toString()).put("id",game.getString("id")+"keep").put("notebook","game")
        store.save(other);store.delete(game.getString("id"))
        assertNull(store.read(game.getString("id")));assertFalse(crop.exists());assertNotNull(store.read(other.getString("id")))
        assertArrayEquals(original,source.readBytes());store.delete(other.getString("id"))
    }
}

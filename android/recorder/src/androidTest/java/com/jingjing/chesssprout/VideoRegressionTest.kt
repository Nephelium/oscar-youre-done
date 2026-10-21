package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File

/** Private fixture supplied externally; never bundled in either APK. */
@RunWith(AndroidJUnit4::class)
class VideoRegressionTest {
    @Test fun importProvidedVideoFromInitialBoard() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val directory=context.getExternalFilesDir(null)!!
        val start=System.nanoTime()
        VideoImporter.select(context,Uri.fromFile(File(directory,"regression-video.mp4")))
        VideoImporter.seek(context,4100)
        val prepared=VideoImporter.prepare(context,JSONObject().put("side","w"))
        assertEquals(com.github.bhlangonijr.chesslib.Board().fen,prepared.getString("fen"))
        val preparedAt=System.nanoTime()
        VideoImporter.run(context,JSONObject().put("confirmFen",prepared.getString("fen")))
        try {
            val deadline=System.nanoTime()+240_000_000_000L
            while(VideoImporter.state.optString("state")=="processing" && System.nanoTime()<deadline)Thread.sleep(200)
            assertEquals(VideoImporter.state.toString(),"done",VideoImporter.state.getString("state"))
            val record=GameStore(context).read(VideoImporter.state.getString("gameId"))!!
            File(directory,"v133-importer-full.json").writeText(JSONObject()
                .put("elapsedMs",(System.nanoTime()-start)/1e6).put("preparationMs",(preparedAt-start)/1e6)
                .put("state",VideoImporter.state).put("record",record).toString(2))
            val expected=JSONObject(File(directory,"regression-reference.json").readText()).getJSONArray("moves")
            assertEquals(expected.toString(),record.getJSONArray("moves").toString())
            assertEquals(0,(0 until record.getJSONArray("issues").length()).count{!record.getJSONArray("issues").getJSONObject(it).optBoolean("resolved")})
        }finally{VideoImporter.cancel()}
    }
    @Test fun measureProvidedVideo() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val args=InstrumentationRegistry.getArguments()
        val directory=context.getExternalFilesDir(null)!!
        val uri=Uri.fromFile(File(directory,"regression-video.mp4"))
        val mode=args.getString("decodeMode")?:"sequential"
        val end=args.getString("endMs")?.toLong()?:275000L
        val reportName=args.getString("reportName")?:"video-regression.json"
        val retriever=MediaMetadataRetriever().apply{setDataSource(context,uri)}
        val options=JSONObject().put("side","w")
        if(args.getString("profile")=="bundled")options.put("initialFen",CaptureTracker(moves=listOf("d2d4")).board.fen)
        val pipeline=CapturePipeline(context,options,"本地视频回归")
        if(args.getString("profile")=="bundled")pipeline.recognizer.loadProfile(ThemeStore(context).bundled()!!)
        val events=JSONArray();val started=System.nanoTime()
        var decodeNs=0L;var processNs=0L;var count=0;var previous=""
        var time=if(args.getString("profile")=="bundled")5200L else 2600L
        val reader=if(mode!="retriever")VideoFrameReader(context,uri,time) else null
        fun readerMetric(name: String): Any?=reader?.let{runCatching{it.javaClass.getMethod(name).invoke(it)}.getOrNull()}
        try {
            while(time<end) {
                val begin=System.nanoTime()
                val decoded=if(mode=="legacy132")reader?.javaClass?.getMethod("next",kotlin.jvm.functions.Function0::class.java)
                    ?.invoke(reader, { false }) as VideoFrameReader.Frame? else reader?.next(){false}
                if(reader!=null && decoded==null)break
                val frame=decoded?.bitmap?:requireNotNull(retriever.getFrameAtTime(time*1000,MediaMetadataRetriever.OPTION_CLOSEST))
                val timestamp=decoded?.timeMs?:time
                val decodedAt=System.nanoTime();decodeNs+=decodedAt-begin
                pipeline.process(frame);processNs+=System.nanoTime()-decodedAt;count++
                val marker="${pipeline.confirmedPlies}|${pipeline.message}|${pipeline.recognizer.region}"
                if(marker!=previous || count%50==0) {
                    events.put(JSONObject().put("time",timestamp).put("plies",pipeline.confirmedPlies).put("message",pipeline.message)
                        .put("region",pipeline.recognizer.region.toString()).put("processMs",pipeline.lastProcessMs)
                        .put("decodeMs",decodeNs/1e6).put("processTotalMs",processNs/1e6)
                        .put("elapsedMs",(System.nanoTime()-started)/1e6)
                        .put("diagnostic",runCatching{pipeline.recognizer.javaClass.getMethod("getDiagnostic").invoke(pipeline.recognizer)}.getOrNull())
                        .put("fen",pipeline.tracker.board.fen).put("moves",JSONArray(pipeline.tracker.moves)))
                    previous=marker
                    File(directory,reportName).writeText(JSONObject().put("events",events).toString(2))
                }
                if(timestamp in 65000..65500 || timestamp in 80000..80500)File(directory,"$mode-$timestamp.png").outputStream().use{frame.compress(Bitmap.CompressFormat.PNG,100,it)}
                frame.recycle();time=timestamp+200
            }
            pipeline.finish()
            File(directory,reportName).writeText(JSONObject().put("mode",mode).put("elapsedMs",(System.nanoTime()-started)/1e6)
                .put("decodeMs",decodeNs/1e6).put("processMs",processNs/1e6).put("samples",count)
                .put("classified",pipeline.recognizer.classifiedFrames).put("reused",pipeline.recognizer.reusedFrames)
                .put("convertedFrames",readerMetric("getConvertedFrames")).put("reusedRgbFrames",readerMetric("getReusedFrames"))
                .put("conversionMs",(readerMetric("getConversionNs") as? Number)?.toDouble()?.div(1e6)).put("decoder",readerMetric("getCodecName"))
                .put("events",events).put("game",pipeline.game).toString(2))
            val reference=File(directory,"regression-reference.json")
            if(end>=275000 && reference.isFile && mode!="legacy132") {
                val expected=JSONObject(reference.readText()).getJSONArray("moves")
                val offset=if(args.getString("profile")=="bundled")1 else 0
                assertEquals((offset until expected.length()).map{expected.getString(it)},pipeline.tracker.moves)
                assertEquals(0,(0 until pipeline.game.getJSONArray("issues").length()).count{!pipeline.game.getJSONArray("issues").getJSONObject(it).optBoolean("resolved")})
            }
        } finally {reader?.close();retriever.release()}
    }
}

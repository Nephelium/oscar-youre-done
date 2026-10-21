package com.jingjing.chesssprout

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import org.json.JSONObject

object VideoImporter {
    @Volatile private var preview: Bitmap?=null
    @Volatile var state=JSONObject().put("state","idle")
        private set
    @Volatile private var cancelled=false
    private var selected: Uri?=null
    private var previewTime=0L
    private var prepared: JSONObject?=null
    private var pendingFen: String?=null
    fun select(context: Context,uri: Uri) {
        if(state.optString("state")=="processing")error("请先结束当前导入")
        state=JSONObject().put("state","loading").put("message","正在读取录屏与预览")
        val retriever=MediaMetadataRetriever()
        try {
            retriever.setDataSource(context,uri)
            val duration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?:error("无法读取视频时长")
            require(duration in 1..5400000) { "请选择 90 分钟以内的录屏" }
            val frame=readFrame(retriever,0)?:error("无法读取视频画面")
            synchronized(this) {preview?.recycle();preview=frame;selected=uri;previewTime=0L;prepared=null;pendingFen=null}
            state=JSONObject().put("state","ready").put("duration",duration).put("message","框选棋盘，然后开始识别")
        } catch(error: Exception) {
            state=JSONObject().put("state","error").put("message",error.message?:"无法读取录屏")
            throw error
        } finally {retriever.release()}
    }
    fun previewCopy(): Bitmap?=synchronized(this) {preview?.copy(Bitmap.Config.ARGB_8888,false)}
    @Synchronized fun seek(context: Context,time: Long) {
        check(state.optString("state") in listOf("ready","awaiting")){"请先结束当前导入"}
        val retriever=MediaMetadataRetriever()
        try {
            retriever.setDataSource(context,selected?:error("请先选择录屏"))
            val duration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
            previewTime=time.coerceIn(0,maxOf(0,duration-1))
            val frame=readFrame(retriever,previewTime)?:error("无法读取这一帧")
            preview?.recycle();preview=frame
            pendingFen=null;prepared=null
            state=JSONObject().put("state","ready").put("duration",duration).put("previewTime",previewTime)
        } finally {retriever.release()}
    }
    @Synchronized fun prepare(context: Context,options: JSONObject): JSONObject {
        check(state.optString("state") in listOf("ready","awaiting")){"请先选择录屏"}
        val frame=preview?:error("请重新选择录屏")
        val recognizer=BoardRecognizer(options.optString("side")=="b")
        recognizer.region=options.optJSONObject("region")?.let {CapturePipeline.rect(it)}
        val store=ThemeStore(context)
        val profile=store.load()
        profile?.let{recognizer.loadProfile(it)}
        val learner=BoardRecognizer(recognizer.blackBottom).apply{region=recognizer.region}
        if(learner.calibrate(frame)) {
            recognizer.loadProfile(learner.profile());recognizer.region=learner.region;recognizer.blackBottom=learner.blackBottom
            store.save(learner.profile())
        } else require(recognizer.calibrated){"无法读取棋子样式"}
        val placement=recognizer.recognize(frame)?.placement
        require(placement!=null && '?' !in placement && placement.count{it=='K'}==1 && placement.count{it=='k'}==1) {
            "这帧棋盘未识别清楚。请调整选框，或拖动时间选择棋子静止的画面。"
        }
        val standard=com.github.bhlangonijr.chesslib.Board().fen
        pendingFen=if(placement==standard.substringBefore(' '))standard else "$placement w - - 0 1"
        val side=if(recognizer.blackBottom)"b" else "w"
        prepared=JSONObject(options.toString()).put("side",side).put("startMs",previewTime)
        recognizer.region?.let{prepared!!.put("region",JSONObject().put("left",it.left.toDouble()).put("top",it.top.toDouble())
            .put("right",it.right.toDouble()).put("bottom",it.bottom.toDouble()))}
        state.put("state","awaiting")
        return JSONObject().put("fen",pendingFen).put("side",side)
    }
    private fun readFrame(retriever: MediaMetadataRetriever,time: Long): Bitmap? {
        // Ask the decoder for recognition-sized pixels instead of allocating and
        // copying a full phone-resolution Bitmap for every sampled timestamp.
        if(android.os.Build.VERSION.SDK_INT>=27) {
            val width=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()?:0
            val height=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()?:0
            val rotation=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull()?:0
            val uprightWidth=if(rotation%180==0)width else height
            val uprightHeight=if(rotation%180==0)height else width
            if(uprightWidth>0 && uprightHeight>0) {
                val factor=minOf(1f,720f/uprightWidth)
                runCatching { retriever.getScaledFrameAtTime(time*1000,MediaMetadataRetriever.OPTION_CLOSEST,
                    maxOf(1,(uprightWidth*factor).toInt()),maxOf(1,(uprightHeight*factor).toInt())) }.getOrNull()?.let{return it}
            }
        }
        val full=retriever.getFrameAtTime(time*1000,MediaMetadataRetriever.OPTION_CLOSEST)?:return null
        val factor=minOf(1f,720f/full.width)
        val small=Bitmap.createScaledBitmap(full,maxOf(1,(full.width*factor).toInt()),maxOf(1,(full.height*factor).toInt()),true)
        if(small!==full)full.recycle()
        return small
    }
    fun cancel() {cancelled=true}
    fun run(context: Context,options: JSONObject) {
        val uri=selected?:error("请先选择录屏")
        check(state.optString("state")=="awaiting") { "请先识别并确认起始局面" }
        val confirmed=options.getString("confirmFen")
        require(confirmed.substringBefore(' ')==pendingFen?.substringBefore(' ')){"棋子位置变化后请重新识别"}
        val normalized=CaptureTracker(confirmed).board.fen
        val captureOptions=JSONObject(requireNotNull(prepared).toString()).put("initialFen",normalized)
            .put("mode",if(normalized==com.github.bhlangonijr.chesslib.Board().fen)"game" else "position")
        cancelled=false
        state=JSONObject().put("state","processing").put("progress",0).put("message","正在识别录屏")
        Thread({
            val retriever=MediaMetadataRetriever();var pipeline: CapturePipeline?=null
            var reader: VideoFrameReader?=null
            try {
                retriever.setDataSource(context,uri)
                val duration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
                pipeline=CapturePipeline(context,captureOptions,"录屏导入")
                var time=captureOptions.optLong("startMs")
                reader=runCatching{VideoFrameReader(context,uri,time)}.getOrNull()
                while(time<duration && !cancelled) {
                    // Unsupported codec/image layouts fall back at the current
                    // timestamp, preserving already confirmed moves.
                    val decoded=try{reader?.next(){cancelled}}catch(_: Exception){reader?.close();reader=null;null}
                    if(reader!=null && decoded==null)break
                    val frame=decoded?.bitmap?:if(!cancelled)readFrame(retriever,time) else null
                    if(frame!=null)try {pipeline.process(frame)} finally {frame.recycle()}
                    time=(decoded?.timeMs?:time)+200
                    val start=captureOptions.optLong("startMs")
                    state=JSONObject().put("state","processing").put("progress",(100*(time-start)/maxOf(1,duration-start)).coerceIn(0,100))
                        .put("processedMs",minOf(time,duration)-start).put("duration",duration-start).put("plies",pipeline.confirmedPlies)
                        .put("message",pipeline.message).put("gameId",pipeline.game.getString("id"))
                }
                pipeline.finish(if(cancelled)"导入已停止，已保留确认的棋谱" else "录屏识别完成")
                state=JSONObject().put("state","done").put("gameId",pipeline.game.getString("id")).put("message",pipeline.message)
                    .put("plies",pipeline.confirmedPlies).put("cancelled",cancelled).put("progress",100)
                    .put("classifiedFrames",pipeline.recognizer.classifiedFrames).put("reusedFrames",pipeline.recognizer.reusedFrames)
                    .put("convertedFrames",reader?.convertedFrames).put("reusedRgbFrames",reader?.reusedFrames)
                    .put("conversionMs",reader?.conversionNs?.div(1e6)).put("decoder",reader?.codecName)
            } catch(error: Exception) {
                pipeline?.finish("导入中断，已保留确认的走法")
                state=JSONObject().put("state","error").put("message",error.message?:"录屏无法读取")
                    .put("gameId",pipeline?.game?.optString("id")).put("plies",pipeline?.confirmedPlies?:0)
            } finally {reader?.close();retriever.release()}
        },"chesssprout-video").start()
    }
}

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
        val retriever=MediaMetadataRetriever()
        try {
            retriever.setDataSource(context,uri)
            val duration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?:error("无法读取视频时长")
            require(duration in 1..5400000) { "请选择 90 分钟以内的录屏" }
            val first=retriever.getFrameAtTime(0,MediaMetadataRetriever.OPTION_CLOSEST)?:error("无法读取视频画面")
            val scale=minOf(1f,720f/first.width)
            val frame=Bitmap.createScaledBitmap(first,(first.width*scale).toInt(),(first.height*scale).toInt(),true)
            synchronized(this) {preview?.recycle();preview=frame;selected=uri;previewTime=0L;prepared=null;pendingFen=null}
            if(first!==frame)first.recycle()
            state=JSONObject().put("state","ready").put("duration",duration).put("message","框选棋盘，然后开始识别")
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
            val full=retriever.getFrameAtTime(previewTime*1000,MediaMetadataRetriever.OPTION_CLOSEST)?:error("无法读取这一帧")
            val scale=minOf(1f,720f/full.width)
            val frame=Bitmap.createScaledBitmap(full,(full.width*scale).toInt(),(full.height*scale).toInt(),true)
            preview?.recycle();preview=frame;if(full!==frame)full.recycle()
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
        val learner=BoardRecognizer(recognizer.blackBottom).apply{region=recognizer.region}
        if(learner.calibrate(frame)) {
            recognizer.loadProfile(learner.profile());recognizer.region=learner.region;recognizer.blackBottom=learner.blackBottom
            store.save(learner.profile())
        } else require(store.load()?.let {recognizer.loadProfile(it)}==true){"无法读取棋子样式"}
        val placement=recognizer.recognize(frame)?.placement
        require(placement!=null && '?' !in placement && placement.count{it=='K'}==1 && placement.count{it=='k'}==1) {
            "这帧棋盘未识别清楚。请调整选框，或拖动时间选择棋子静止的画面。"
        }
        val standard=com.github.bhlangonijr.chesslib.Board().fen
        pendingFen=if(placement==standard.substringBefore(' '))standard else "$placement w - - 0 1"
        val side=if(recognizer.blackBottom)"b" else "w"
        prepared=JSONObject(options.toString()).put("side",side).put("startMs",previewTime)
        state.put("state","awaiting")
        return JSONObject().put("fen",pendingFen).put("side",side)
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
            try {
                retriever.setDataSource(context,uri)
                val duration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
                pipeline=CapturePipeline(context,captureOptions,"录屏导入")
                var time=captureOptions.optLong("startMs")
                while(time<duration && !cancelled) {
                    val frame=retriever.getFrameAtTime(time*1000,MediaMetadataRetriever.OPTION_CLOSEST)
                    if(frame!=null) {
                        val factor=minOf(1f,720f/frame.width)
                        val small=Bitmap.createScaledBitmap(frame,(frame.width*factor).toInt(),(frame.height*factor).toInt(),true)
                        pipeline.process(small)
                        if(small!==frame)small.recycle();frame.recycle()
                    }
                    time+=200
                    state=JSONObject().put("state","processing").put("progress",(100*time/duration).coerceAtMost(100))
                        .put("message",pipeline.message).put("gameId",pipeline.game.getString("id"))
                }
                pipeline.finish(if(cancelled)"导入已停止，已保留确认的棋谱" else "录屏识别完成")
                state=JSONObject().put("state","done").put("gameId",pipeline.game.getString("id")).put("message",pipeline.message)
                    .put("plies",pipeline.tracker.moves.size)
            } catch(error: Exception) {
                pipeline?.finish("导入中断，已保留确认的走法")
                state=JSONObject().put("state","error").put("message",error.message?:"录屏无法读取")
            } finally {retriever.release()}
        },"chesssprout-video").start()
    }
}

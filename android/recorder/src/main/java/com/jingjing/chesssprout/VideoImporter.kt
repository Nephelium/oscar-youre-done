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
            synchronized(this) {preview?.recycle();preview=frame;selected=uri}
            if(first!==frame)first.recycle()
            state=JSONObject().put("state","ready").put("duration",duration).put("message","框选棋盘，然后开始识别")
        } finally {retriever.release()}
    }
    fun previewCopy(): Bitmap?=synchronized(this) {preview?.copy(Bitmap.Config.ARGB_8888,false)}
    fun cancel() {cancelled=true}
    fun run(context: Context,options: JSONObject) {
        val uri=selected?:error("请先选择录屏")
        check(state.optString("state")=="ready") { "录屏正在处理" }
        cancelled=false
        state=JSONObject().put("state","processing").put("progress",0).put("message","正在识别录屏")
        Thread({
            val retriever=MediaMetadataRetriever();var pipeline: CapturePipeline?=null
            try {
                retriever.setDataSource(context,uri)
                val duration=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
                pipeline=CapturePipeline(context,options,"录屏导入")
                var time=0L
                while(time<duration && !cancelled) {
                    val frame=retriever.getFrameAtTime(time*1000,MediaMetadataRetriever.OPTION_CLOSEST)
                    if(frame!=null) {
                        val factor=minOf(1f,720f/frame.width)
                        val small=Bitmap.createScaledBitmap(frame,(frame.width*factor).toInt(),(frame.height*factor).toInt(),true)
                        pipeline.process(small)
                        if(small!==frame)small.recycle();frame.recycle()
                    }
                    time+=300
                    state=JSONObject().put("state","processing").put("progress",(100*time/duration).coerceAtMost(100))
                        .put("message",pipeline.message).put("gameId",pipeline.game.getString("id"))
                }
                pipeline.finish(if(cancelled)"导入已停止，已保留确认的棋谱" else "录屏识别完成")
                state=JSONObject().put("state","done").put("gameId",pipeline.game.getString("id")).put("message",pipeline.message)
            } catch(error: Exception) {
                pipeline?.finish("导入中断，已保留确认的走法")
                state=JSONObject().put("state","error").put("message",error.message?:"录屏无法读取")
            } finally {retriever.release()}
        },"chesssprout-video").start()
    }
}

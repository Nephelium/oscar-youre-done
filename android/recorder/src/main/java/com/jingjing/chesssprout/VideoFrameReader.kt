package com.jingjing.chesssprout

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri

/** Decode forward once, instead of seeking back to a keyframe at each sample. */
class VideoFrameReader(context: Context,uri: Uri,startMs: Long): AutoCloseable {
    data class Frame(val bitmap: Bitmap,val timeMs: Long)
    private val extractor=MediaExtractor()
    private var decoder: MediaCodec?=null
    private var inputEnded=false
    private var outputEnded=false
    private var nextUs=startMs*1000
    private var rotation=0
    private val info=MediaCodec.BufferInfo()
    var convertedFrames=0
        private set
    var reusedFrames=0
        private set
    var conversionNs=0L
        private set
    val codecName: String get()=decoder?.name?:""
    init {
        try {
            extractor.setDataSource(context,uri,null)
            val track=(0 until extractor.trackCount).first{extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/")==true}
            extractor.selectTrack(track)
            val format=extractor.getTrackFormat(track)
            rotation=if(format.containsKey(MediaFormat.KEY_ROTATION))format.getInteger(MediaFormat.KEY_ROTATION) else 0
            format.setInteger(MediaFormat.KEY_ROTATION,0)
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT,MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
            extractor.seekTo(nextUs,MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
            decoder=MediaCodec.createDecoderByType(requireNotNull(format.getString(MediaFormat.KEY_MIME)))
            requireNotNull(decoder).apply{configure(format,null,null,0);start()}
        } catch(error: Exception) {close();throw error}
    }
    fun next(cancelled: ()->Boolean): Frame? {
        val codec=requireNotNull(decoder)
        var lastOutput=System.nanoTime()
        while(!outputEnded && !cancelled()) {
            // Fill all available input buffers before waiting for output. Feeding
            // one packet then waiting 10 ms serializes pipelined HEVC decoders.
            while(!inputEnded && !cancelled()) {
                val index=codec.dequeueInputBuffer(0)
                if(index<0)break
                if(index>=0) {
                    val input=requireNotNull(codec.getInputBuffer(index))
                    val count=extractor.readSampleData(input,0)
                    if(count<0) {
                        codec.queueInputBuffer(index,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputEnded=true
                    }else{
                        codec.queueInputBuffer(index,0,count,extractor.sampleTime,0);extractor.advance()
                    }
                }
            }
            val index=codec.dequeueOutputBuffer(info,1_000)
            if(index>=0) {
                lastOutput=System.nanoTime()
                outputEnded=info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM!=0
                try {
                    if(info.size>0 && info.presentationTimeUs>=nextUs) {
                        val image=requireNotNull(codec.getOutputImage(index)){"Decoder does not expose YUV frames"}
                        val before=System.nanoTime()
                        val bitmap=try{convert(image,codec.getOutputFormat(index))}finally{image.close()}
                        convertedFrames++
                        conversionNs+=System.nanoTime()-before
                        val time=info.presentationTimeUs
                        nextUs=time+200_000
                        return Frame(bitmap,time/1000)
                    }
                }finally{codec.releaseOutputBuffer(index,false)}
            }else if(System.nanoTime()-lastOutput>10_000_000_000L)error("Video decoder stalled")
        }
        return null
    }
    private fun convert(image: Image,format: MediaFormat): Bitmap {
        require(image.format==ImageFormat.YUV_420_888)
        val crop=image.cropRect
        val scale=minOf(1.0,720.0/if(rotation%180==0)crop.width() else crop.height())
        val width=maxOf(1,(crop.width()*scale).toInt());val height=maxOf(1,(crop.height()*scale).toInt())
        val planes=image.planes
        val bytes=planes.map{plane->val buffer=plane.buffer.duplicate().apply{rewind()};ByteArray(buffer.remaining()).also{buffer.get(it)}}
        val full=format.containsKey(MediaFormat.KEY_COLOR_RANGE) && format.getInteger(MediaFormat.KEY_COLOR_RANGE)==MediaFormat.COLOR_RANGE_FULL
        val bt709=format.containsKey(MediaFormat.KEY_COLOR_STANDARD) && format.getInteger(MediaFormat.KEY_COLOR_STANDARD)==MediaFormat.COLOR_STANDARD_BT709
        val pixels=IntArray(width*height)
        val rv=if(full){if(bt709)403 else 359}else if(bt709)459 else 409
        val gu=if(full){if(bt709)48 else 88}else if(bt709)55 else 100
        val gv=if(full){if(bt709)120 else 183}else if(bt709)136 else 208
        val bu=if(full){if(bt709)475 else 454}else if(bt709)541 else 516
        val yBytes=bytes[0];val uBytes=bytes[1];val vBytes=bytes[2]
        val yStride=planes[0].rowStride;val uStride=planes[1].rowStride;val vStride=planes[2].rowStride
        val xY=IntArray(width){(crop.left+it*crop.width()/width)*planes[0].pixelStride}
        val xU=IntArray(width){((crop.left+it*crop.width()/width)/2)*planes[1].pixelStride}
        val xV=IntArray(width){((crop.left+it*crop.width()/width)/2)*planes[2].pixelStride}
        for(y in 0 until height) {
          val sy=crop.top+y*crop.height()/height
          val rowY=sy*yStride;val rowU=(sy/2)*uStride;val rowV=(sy/2)*vStride;val row=y*width
          for(x in 0 until width) {
            val luma=yBytes[rowY+xY[x]].toInt() and 255
            val u=(uBytes[rowU+xU[x]].toInt() and 255)-128
            val v=(vBytes[rowV+xV[x]].toInt() and 255)-128
            val c=if(full)256*luma else 298*maxOf(0,luma-16)
            val r=((c+rv*v+128) shr 8).coerceIn(0,255)
            val g=((c-gu*u-gv*v+128) shr 8).coerceIn(0,255)
            val b=((c+bu*u+128) shr 8).coerceIn(0,255)
            pixels[row+x]=(0xff shl 24) or (r shl 16) or (g shl 8) or b
          }
        }
        val bitmap=Bitmap.createBitmap(pixels,width,height,Bitmap.Config.ARGB_8888)
        if(rotation%360==0)return bitmap
        val turned=Bitmap.createBitmap(bitmap,0,0,width,height,Matrix().apply{postRotate(rotation.toFloat())},false)
        if(turned!==bitmap)bitmap.recycle()
        return turned
    }
    override fun close() {
        decoder?.let{runCatching{it.stop()};runCatching{it.release()}}
        decoder=null;runCatching{extractor.release()}
    }
}

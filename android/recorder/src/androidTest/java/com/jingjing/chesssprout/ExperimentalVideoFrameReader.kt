package com.jingjing.chesssprout

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri

/** Decode forward once, instead of seeking back to a keyframe at each sample. */
internal class ExperimentalVideoFrameReader(context: Context,uri: Uri,startMs: Long,private val sampleMs: Long=200,private val syncOnly: Boolean=false): AutoCloseable {
    data class Frame(val bitmap: Bitmap,val timeMs: Long)
    private val extractor=MediaExtractor()
    private var decoder: MediaCodec?=null
    private var inputEnded=false
    private var outputEnded=false
    private var nextUs=startMs*1000
    private var rotation=0
    private val converter=YuvFrameConverter()
    private val info=MediaCodec.BufferInfo()
    var convertedFrames=0
        private set
    var reusedFrames=0
        private set
    var conversionNs=0L
        private set
    val codecName: String get()=decoder?.name?:""
    init {
        require(sampleMs>=1)
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
                // Experimental sparse reader: no default behavior change. Sync
                // samples are independently seekable; dependent packets are skipped.
                if(syncOnly && extractor.sampleTime>=0 && extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC==0) {
                    extractor.advance();continue
                }
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
                        val bitmap=try{converter.convert(image,codec.getOutputFormat(index),rotation)}finally{image.close()}
                        convertedFrames++
                        conversionNs+=System.nanoTime()-before
                        val time=info.presentationTimeUs
                        nextUs=time+sampleMs*1000
                        return Frame(bitmap,time/1000)
                    }
                }finally{codec.releaseOutputBuffer(index,false)}
            }else if(System.nanoTime()-lastOutput>10_000_000_000L)error("Video decoder stalled")
        }
        return null
    }
    override fun close() {
        decoder?.let{runCatching{it.stop()};runCatching{it.release()}}
        decoder=null;runCatching{extractor.release()}
    }
}

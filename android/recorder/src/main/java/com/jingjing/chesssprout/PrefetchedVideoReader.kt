package com.jingjing.chesssprout

import android.content.Context
import android.net.Uri
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/** One frame of lookahead. Decoder and conversion stay on their owning thread. */
internal class PrefetchedVideoReader(context: Context,uri: Uri,startMs: Long): AutoCloseable {
    private data class Item(val frame: VideoFrameReader.Frame?=null,val error: Exception?=null)
    private val queue=ArrayBlockingQueue<Item>(1)
    @Volatile private var stopped=false
    @Volatile var convertedFrames=0
        private set
    val reusedFrames=0
    @Volatile var conversionNs=0L
        private set
    @Volatile var codecName=""
        private set
    private val worker=Thread({
        var pending: VideoFrameReader.Frame?=null
        try {
            VideoFrameReader(context,uri,startMs).use {reader->
                codecName=reader.codecName
                while(!stopped) {
                    pending=reader.next{stopped}
                    convertedFrames=reader.convertedFrames;conversionNs=reader.conversionNs
                    val item=Item(pending)
                    var offered=false
                    while(!stopped && !offered)offered=queue.offer(item,50,TimeUnit.MILLISECONDS)
                    if(offered)pending=null
                    if(stopped)break
                    if(item.frame==null)break
                }
            }
        } catch(error: Exception) {
            if(!stopped)try {
                while(!stopped && !queue.offer(Item(error=error),50,TimeUnit.MILLISECONDS)) { }
            }catch(_: InterruptedException){Thread.currentThread().interrupt()}
        } finally {
            pending?.bitmap?.recycle()
            if(stopped)drain()
        }
    },"chesssprout-decode").apply{start()}

    fun next(cancelled: ()->Boolean): VideoFrameReader.Frame? {
        while(!stopped && !cancelled()) {
            val item=queue.poll(50,TimeUnit.MILLISECONDS)?:continue
            item.error?.let{throw it}
            return item.frame
        }
        return null
    }
    private fun drain() {while(true)(queue.poll()?:break).frame?.bitmap?.recycle()}
    override fun close() {
        stopped=true;worker.interrupt()
        // The decoder polls output at 1 ms and observes stopped between polls.
        // Never release a codec from another thread while it is reading an image.
        worker.join(2000)
        drain()
    }
}

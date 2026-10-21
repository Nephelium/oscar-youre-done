package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import java.nio.ByteBuffer

/** Owned by the capture handler. Callers must hold the preview lock while drawing. */
internal class ScreenFrameConverter : AutoCloseable {
    private var buffer: Bitmap?=null
    private var output: Bitmap?=null
    private var canvas: Canvas?=null
    private val paint=Paint(Paint.FILTER_BITMAP_FLAG)
    private val source=Rect()
    private val target=Rect()

    fun convert(bytes: ByteBuffer,width: Int,height: Int,rowStride: Int,pixelStride: Int): Bitmap {
        require(pixelStride==4 && rowStride%4==0)
        val paddedWidth=rowStride/4
        if(buffer?.width!=paddedWidth || buffer?.height!=height) {
            buffer?.recycle();buffer=Bitmap.createBitmap(paddedWidth,height,Bitmap.Config.ARGB_8888)
        }
        val factor=minOf(1f,720f/width)
        val w=maxOf(1,(width*factor).toInt());val h=maxOf(1,(height*factor).toInt())
        requireNotNull(buffer).copyPixelsFromBuffer(bytes)
        // A compositor-sized, unpadded image already is the desired bitmap.
        if(paddedWidth==width && w==width && h==height)return requireNotNull(buffer)
        if(output?.width!=w || output?.height!=h) {
            canvas=null;output?.recycle();output=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888)
            canvas=Canvas(requireNotNull(output))
        }
        source.set(0,0,width,height);target.set(0,0,w,h)
        // Match createScaledBitmap's transparent destination and default blend.
        // SRC selects a different Skia rounding path when downscaling.
        requireNotNull(output).eraseColor(0)
        requireNotNull(canvas).drawBitmap(requireNotNull(buffer),source,target,paint)
        return requireNotNull(output)
    }
    override fun close() {canvas=null;buffer?.recycle();output?.recycle();buffer=null;output=null}
}

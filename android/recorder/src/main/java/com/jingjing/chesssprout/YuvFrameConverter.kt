package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.media.Image
import android.media.MediaFormat

/** Same integer colors and sampling as 1.3.3; scratch storage belongs to one reader. */
internal class YuvFrameConverter {
    private val bytes=Array(3){ByteArray(0)}
    private var pixels=IntArray(0)
    private var xY=IntArray(0)
    private var xU=IntArray(0)
    private var xV=IntArray(0)
    private var geometry: List<Int>?=null
    private var colors: List<Int>?=null
    private val yLut=IntArray(256)
    private val rLut=IntArray(256)
    private val guLut=IntArray(256)
    private val gvLut=IntArray(256)
    private val bLut=IntArray(256)
    private val redLut=IntArray(256*256)
    private val blueLut=IntArray(256*256)
    fun convert(image: Image,format: MediaFormat,rotation: Int): Bitmap {
        require(image.format==ImageFormat.YUV_420_888)
        val crop=image.cropRect
        val scale=minOf(1.0,720.0/if(rotation%180==0)crop.width() else crop.height())
        val width=maxOf(1,(crop.width()*scale).toInt());val height=maxOf(1,(crop.height()*scale).toInt())
        val planes=image.planes
        for(i in 0..2) {
            val source=planes[i].buffer.duplicate().apply{rewind()}
            if(bytes[i].size!=source.remaining())bytes[i]=ByteArray(source.remaining())
            source.get(bytes[i])
        }
        val full=format.containsKey(MediaFormat.KEY_COLOR_RANGE) && format.getInteger(MediaFormat.KEY_COLOR_RANGE)==MediaFormat.COLOR_RANGE_FULL
        val bt709=format.containsKey(MediaFormat.KEY_COLOR_STANDARD) && format.getInteger(MediaFormat.KEY_COLOR_STANDARD)==MediaFormat.COLOR_STANDARD_BT709
        if(pixels.size!=width*height)pixels=IntArray(width*height)
        val rv=if(full){if(bt709)403 else 359}else if(bt709)459 else 409
        val gu=if(full){if(bt709)48 else 88}else if(bt709)55 else 100
        val gv=if(full){if(bt709)120 else 183}else if(bt709)136 else 208
        val bu=if(full){if(bt709)475 else 454}else if(bt709)541 else 516
        val yBytes=bytes[0];val uBytes=bytes[1];val vBytes=bytes[2]
        val yStride=planes[0].rowStride;val uStride=planes[1].rowStride;val vStride=planes[2].rowStride
        val key=listOf(width,crop.left,crop.width(),planes[0].pixelStride,planes[1].pixelStride,planes[2].pixelStride)
        if(key!=geometry) {
            geometry=key
            xY=IntArray(width){(crop.left+it*crop.width()/width)*planes[0].pixelStride}
            xU=IntArray(width){((crop.left+it*crop.width()/width)/2)*planes[1].pixelStride}
            xV=IntArray(width){((crop.left+it*crop.width()/width)/2)*planes[2].pixelStride}
        }
        val colorKey=listOf(rv,gu,gv,bu,if(full)1 else 0)
        if(colorKey!=colors) {
            colors=colorKey
            for(i in 0..255) {
                yLut[i]=if(full)256*i else 298*maxOf(0,i-16)
                rLut[i]=rv*(i-128);guLut[i]=gu*(i-128);gvLut[i]=gv*(i-128);bLut[i]=bu*(i-128)
            }
            for(y in 0..255)for(chroma in 0..255) {
                redLut[(y shl 8) or chroma]=(((yLut[y]+rLut[chroma]+128) shr 8).coerceIn(0,255) shl 16)
                blueLut[(y shl 8) or chroma]=((yLut[y]+bLut[chroma]+128) shr 8).coerceIn(0,255)
            }
        }
        for(y in 0 until height) {
          val sy=crop.top+y*crop.height()/height
          val rowY=sy*yStride;val rowU=(sy/2)*uStride;val rowV=(sy/2)*vStride;val row=y*width
          for(x in 0 until width) {
            val luma=yBytes[rowY+xY[x]].toInt() and 255
            val u=uBytes[rowU+xU[x]].toInt() and 255
            val v=vBytes[rowV+xV[x]].toInt() and 255
            val c=yLut[luma]
            val g=((c-guLut[u]-gvLut[v]+128) shr 8).coerceIn(0,255)
            pixels[row+x]=(0xff shl 24) or redLut[(luma shl 8) or v] or (g shl 8) or blueLut[(luma shl 8) or u]
          }
        }
        val bitmap=Bitmap.createBitmap(pixels,width,height,Bitmap.Config.ARGB_8888)
        if(rotation%360==0)return bitmap
        val turned=Bitmap.createBitmap(bitmap,0,0,width,height,Matrix().apply{postRotate(rotation.toFloat())},false)
        if(turned!==bitmap)bitmap.recycle()
        return turned
    }
}

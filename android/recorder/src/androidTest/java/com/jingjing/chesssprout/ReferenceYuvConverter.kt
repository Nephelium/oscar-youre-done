package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.media.Image
import android.media.MediaFormat

internal class ReferenceYuvConverter {
    fun convert(image: Image,format: MediaFormat,rotation: Int): Bitmap {
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
}

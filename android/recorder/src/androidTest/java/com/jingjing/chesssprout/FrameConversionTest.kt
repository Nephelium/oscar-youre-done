package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.Rect
import android.media.ImageReader
import android.media.ImageWriter
import android.media.MediaFormat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer

@RunWith(AndroidJUnit4::class)
class FrameConversionTest {
    @Test fun yuvColorsCropScaleRotationAndReuseMatchPreviousVersionExactly() {
        val fast=YuvFrameConverter();val reference=ReferenceYuvConverter()
        for(size in listOf(96 to 64,736 to 960)) {
            val reader=ImageReader.newInstance(size.first,size.second,ImageFormat.YUV_420_888,2)
            val writer=ImageWriter.newInstance(reader.surface,2)
            try {
                val image=writer.dequeueInputImage()
                try {
                    val random=java.util.Random(134)
                    image.planes.forEach {p->val bytes=ByteArray(p.buffer.remaining());random.nextBytes(bytes);p.buffer.put(bytes);p.buffer.rewind()}
                    for(full in listOf(false,true))for(bt709 in listOf(false,true))for(rotation in listOf(0,90,180,270)) {
                        image.cropRect=if(full)Rect(2,4,size.first-2,size.second-4) else Rect(0,0,size.first,size.second)
                        val format=MediaFormat().apply {
                            setInteger(MediaFormat.KEY_COLOR_RANGE,if(full)MediaFormat.COLOR_RANGE_FULL else MediaFormat.COLOR_RANGE_LIMITED)
                            setInteger(MediaFormat.KEY_COLOR_STANDARD,if(bt709)MediaFormat.COLOR_STANDARD_BT709 else MediaFormat.COLOR_STANDARD_BT601_NTSC)
                        }
                        val old=reference.convert(image,format,rotation);val current=fast.convert(image,format,rotation)
                        assertTrue("$size full=$full bt709=$bt709 rotation=$rotation",old.sameAs(current))
                        old.recycle();current.recycle()
                    }
                }finally{image.close()}
            }finally{writer.close();reader.close()}
        }
    }
    @Test fun screenCopyMatchesPreviousPixelsAndMeasuresAllocationSavings() {
        val converter=ScreenFrameConverter()
        val measurements=JSONObject()
        try {
            for((width,height,padding) in listOf(720 to 1280,1440 to 3200,1280 to 720).mapIndexed{i,p->Triple(p.first,p.second,if(i==1)16 else 0)}) {
                val padded=width+padding
                val bitmap=Bitmap.createBitmap(padded,height,Bitmap.Config.ARGB_8888)
                val pixels=IntArray(padded*height){i->0xff000000.toInt() or ((i*3917) and 0xffffff)}
                bitmap.setPixels(pixels,0,padded,0,0,padded,height)
                val bytes=ByteBuffer.allocateDirect(bitmap.byteCount);bitmap.copyPixelsToBuffer(bytes);bitmap.recycle()
                fun old(): Bitmap {
                    bytes.rewind()
                    val buffer=Bitmap.createBitmap(padded,height,Bitmap.Config.ARGB_8888);buffer.copyPixelsFromBuffer(bytes)
                    val crop=Bitmap.createBitmap(buffer,0,0,width,height)
                    val factor=minOf(1f,720f/width)
                    val output=Bitmap.createScaledBitmap(crop,(width*factor).toInt(),(height*factor).toInt(),true)
                    if(crop!==output && crop!==buffer)crop.recycle()
                    if(buffer!==output)buffer.recycle()
                    return output
                }
                val expected=old();bytes.rewind();val actual=converter.convert(bytes,width,height,padded*4,4)
                assertTrue("Screen pixels at $width x $height with $padding padding",expected.sameAs(actual));expected.recycle()
                var beforeNs=0L;var afterNs=0L
                repeat(24) {i->
                    val start=System.nanoTime();old().recycle();val middle=System.nanoTime()
                    bytes.rewind();converter.convert(bytes,width,height,padded*4,4);val end=System.nanoTime()
                    if(i>=4){beforeNs+=middle-start;afterNs+=end-middle}
                }
                measurements.put("${width}x$height",JSONObject().put("oldMeanMs",beforeNs/20e6).put("newMeanMs",afterNs/20e6))
                // Reusing the destination must not accumulate translucent pixels.
                repeat(2) {pass->
                    val translucent=Bitmap.createBitmap(padded,height,Bitmap.Config.ARGB_8888)
                    for(i in pixels.indices)pixels[i]=(((i+pass*37)%256) shl 24) or (pixels[i] and 0xffffff)
                    translucent.setPixels(pixels,0,padded,0,0,padded,height)
                    bytes.rewind();translucent.copyPixelsToBuffer(bytes);translucent.recycle()
                    val wanted=old();bytes.rewind()
                    assertTrue("No stale alpha at $width x $height pass $pass",wanted.sameAs(converter.convert(bytes,width,height,padded*4,4)))
                    wanted.recycle()
                }
            }
        }finally{converter.close()}
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        File(context.getExternalFilesDir(null),"v134-screen-conversion.json").writeText(measurements.toString(2))
    }
}

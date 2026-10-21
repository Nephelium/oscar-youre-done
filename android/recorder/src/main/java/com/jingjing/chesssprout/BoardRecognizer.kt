package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.graphics.RectF
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import org.json.JSONArray
import org.json.JSONObject

/** Theme templates are learned from this user's standard initial board, not from a guessed piece font. */
class BoardRecognizer(var blackBottom: Boolean = false) {
    private var gridReady=false
    var region: RectF? = null
        set(value) {field=value;gridReady=false;lastFingerprint=null}
    var calibrated = false
        private set
    private val banks=mutableMapOf<String,MutableMap<Char,MutableList<FloatArray>>>()
    private var appearance="light"
    private var cachedTemplates: Map<Char,List<FloatArray>>?=null
    private val cachedFeatures=arrayOfNulls<FloatArray>(64)
    private val cachedDistances=arrayOfNulls<List<Pair<Char,Double>>>(64)
    private var lastFingerprint: IntArray?=null
    private var lastObservation: Observation?=null
    private var lastBlackBottom=false
    var reusedFrames=0
        private set
    var classifiedFrames=0
        private set
    var diagnostic=""
        private set
    private val initial = "rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR"
    fun reset(rect: RectF? = region) { region = rect; calibrated = false; banks.clear() }
    fun profile(): JSONObject {
        fun serialize(templates: Map<Char,List<FloatArray>>)=JSONObject().also { data ->
            templates.forEach { (piece,variants) -> data.put(piece.toString(),JSONArray().also { list ->
                variants.forEach { feature -> list.put(JSONArray().also { values -> feature.forEach { values.put(it.toDouble()) } }) }
            }) }
        }
        val mode=if(banks.containsKey(appearance))appearance else banks.keys.first()
        return JSONObject().put("schema",2).put("appearance",mode).put("templates",serialize(banks.getValue(mode))).also { data ->
            banks.filterKeys{it!=mode}.forEach{(key,value)->data.put("alternate",JSONObject().put("schema",2).put("appearance",key).put("templates",serialize(value)))}
        }
    }
    fun loadProfile(data: JSONObject): Boolean = runCatching {
        fun parse(profile: JSONObject): Pair<String,MutableMap<Char,MutableList<FloatArray>>> {
            require(profile.getInt("schema")==2)
            val mode=profile.optString("appearance","light");require(mode=="light"||mode=="dark")
            val saved=profile.getJSONObject("templates");val loaded=mutableMapOf<Char,MutableList<FloatArray>>()
            for(piece in ".prnbqkPRNBQK") {
                val variants=saved.getJSONArray(piece.toString());require(variants.length() in 1..32)
                loaded[piece]=(0 until variants.length()).map { index ->
                    val values=variants.getJSONArray(index);require(values.length()==24*24*3)
                    FloatArray(values.length()) { i -> values.getDouble(i).also { require(it.isFinite() && abs(it)<=1) }.toFloat() }
                }.toMutableList()
            }
            return mode to loaded
        }
        val loaded=mutableMapOf(parse(data));data.optJSONObject("alternate")?.let{loaded+=parse(it)}
        banks.putAll(loaded);lastFingerprint=null;appearance=data.optString("appearance","light");calibrated=true;true
    }.getOrDefault(false)
    private fun appearanceOf(image: Bitmap,box: RectF): String {
        val luminance=(0 until 64).map { index ->
            val x=((box.left+(index%8+.08f)*box.width()/8)*image.width).toInt().coerceIn(0,image.width-1)
            val y=((box.top+(index/8+.08f)*box.height()/8)*image.height).toInt().coerceIn(0,image.height-1)
            val color=image.getPixel(x,y)
            (((color shr 16)and 255)*.2126+((color shr 8)and 255)*.7152+(color and 255)*.0722)
        }.sorted()
        return if(luminance[32]<100)"dark" else "light"
    }
    fun locate(image: Bitmap): RectF? {
        val ratio = min(1f, 440f / image.width)
        val thumb = Bitmap.createScaledBitmap(image, max(1,(image.width*ratio).toInt()), max(1,(image.height*ratio).toInt()), false)
        val w = thumb.width; val h = thumb.height; val pixels = IntArray(w*h); thumb.getPixels(pixels,0,w,0,0,w,h)
        val minimum = min(w,h); val step = max(3, minimum/75)
        var best = 0.0; var box: RectF? = null
        var bestX=0;var bestY=0;var bestSize=0
        fun score(x: Int,y: Int,size: Int): Double {
            val sums=Array(2){DoubleArray(3)};val squares=Array(2){DoubleArray(3)}
            for(row in 0..7)for(col in 0..7)for(sample in 0..3) {
                val dx=if(sample%2==0).08 else .92;val dy=if(sample<2).08 else .92
                val px=(x+(col+dx)*size/8).toInt().coerceIn(0,w-1);val py=(y+(row+dy)*size/8).toInt().coerceIn(0,h-1)
                val color=pixels[py*w+px];val parity=(row+col)%2
                for(channel in 0..2){val value=((color shr(16-channel*8))and 255).toDouble();sums[parity][channel]+=value;squares[parity][channel]+=value*value}
            }
            var contrast=0.0;var variance=0.0
            for(channel in 0..2){contrast+=abs(sums[0][channel]/128-sums[1][channel]/128)
                for(parity in 0..1)variance+=max(0.0,squares[parity][channel]/128-(sums[parity][channel]/128)*(sums[parity][channel]/128))}
            return if(contrast/3>8)contrast/3-sqrt(variance/6)*2.8 else -1.0
        }
        var size = minimum
        while (size >= minimum*0.58) {
            var y = 0
            while (y + size <= h) {
                var x = 0
                while (x + size <= w) {
                    val value=score(x,y,size)
                    if(value>best){best=value;bestX=x;bestY=y;bestSize=size}
                    x += step
                }
                y += step
            }
            size -= step
        }
        if(bestSize>0) {
            val sx=bestX;val sy=bestY;val ss=bestSize
            for(refined in max(16,ss-step)..min(minimum,ss+step))for(y in max(0,sy-step)..min(h-refined,sy+step))for(x in max(0,sx-step)..min(w-refined,sx+step)) {
                val value=score(x,y,refined);if(value>best){best=value;bestX=x;bestY=y;bestSize=refined}
            }
            box=RectF(bestX.toFloat()/w,bestY.toFloat()/h,(bestX+bestSize).toFloat()/w,(bestY+bestSize).toFloat()/h)
        }
        if (thumb !== image) thumb.recycle()
        return if (best > 8) box else null
    }
    fun calibrate(image: Bitmap): Boolean {
        val original = region
        val rough = region ?: locate(image) ?: return false
        val box = refineInitialGrid(image,rough).also{region=it}
        val features = features(image, box)
        val arranged = initial
        val empties = features.indices.filter { arranged[it]=='.' }.map { features[it].map { v -> abs(v) }.average() }
        val occupied = features.indices.filter { arranged[it]!='.' }.map { features[it].map { v -> abs(v) }.average() }
        // A moved or obstructed board must not silently become a labelled calibration dataset.
        if (empties.any { it > 0.025 } || occupied.any { it < 0.025 } || occupied.average() < empties.average()*1.7) {
            if(original==null)region=null
            return false
        }
        val topInk=features.take(16).map{it.average()}.average()
        val bottomInk=features.takeLast(16).map{it.average()}.average()
        if(abs(topInk-bottomInk)<0.04) {if(original==null)region=null;return false}
        blackBottom=bottomInk<topInk
        val labels=if(blackBottom)initial.reversed() else initial
        appearance=appearanceOf(image,box)
        val templates=mutableMapOf<Char,MutableList<FloatArray>>()
        banks[appearance]=templates
        lastFingerprint=null
        for (i in features.indices) templates.getOrPut(labels[i]) { mutableListOf() }.add(features[i])
        calibrated = true
        gridReady=true
        return true
    }
    private fun refineInitialGrid(image: Bitmap,rough: RectF,initialPosition: Boolean=true): RectF {
        // Initial middle ranks are empty. Fit their actual colour transitions, rather
        // than retaining the coarse detector's several-pixel sampling plateau.
        val left=rough.left*image.width;val top=rough.top*image.height;val roughCell=rough.width()*image.width/8
        val radius=max(4,(roughCell*.18f).toInt())
        fun gradient(x: Float,y: Float,vertical: Boolean): Double {
            fun color(dx: Int,dy: Int)=image.getPixel((x.toInt()+dx).coerceIn(0,image.width-1),(y.toInt()+dy).coerceIn(0,image.height-1))
            val a=if(vertical)color(-1,0)else color(0,-1);val b=if(vertical)color(1,0)else color(0,1)
            return (0..2).sumOf{c->abs(((a shr(16-c*8))and 255)-((b shr(16-c*8))and 255)).toDouble()}/3
        }
        val boundaries=mutableListOf<Double>()
        fun aggregate(values: List<Double>): Double=if(initialPosition)values.sum() else values.sorted()[values.size/2]
        for(j in 1..7){
            val center=(left+j*roughCell).toInt()
            val scores=(center-radius..center+radius).map{x->x to aggregate(
                if(initialPosition)(2..5).map{row->gradient(x.toFloat(),top+(row+.5f)*roughCell,true)}
                else (0..7).flatMap{row->listOf(.1f,.9f).map{offset->gradient(x.toFloat(),top+(row+offset)*roughCell,true)}})}
            val peak=scores.maxOf{it.second};if(peak<10)return rough
            boundaries.add(scores.filter{it.second>=peak*.98}.map{it.first}.average())
        }
        val mean=boundaries.average()
        val cell=boundaries.mapIndexed{i,v->(i+1-4)*(v-mean)}.sum()/28
        val fittedLeft=mean-4*cell
        if(cell<10 || boundaries.mapIndexed{i,v->abs(v-(fittedLeft+(i+1)*cell))}.max()>cell*.05)return rough
        val tops=mutableListOf<Double>()
        for(j in 3..5){
            val center=(top+j*roughCell).toInt()
            val scores=(center-radius..center+radius).map{y->y to aggregate(
                if(initialPosition)(1..6).map{col->gradient((fittedLeft+(col+.5)*cell).toFloat(),y.toFloat(),false)}
                else (0..7).flatMap{col->listOf(.1,.9).map{offset->gradient((fittedLeft+(col+offset)*cell).toFloat(),y.toFloat(),false)}})}
            val peak=scores.maxOf{it.second};if(peak<10)return rough
            tops.add(scores.filter{it.second>=peak*.98}.map{it.first}.average()-j*cell)
        }
        val fittedTop=tops.sorted()[1];val size=cell*8
        // Full-bleed boards can fit half a pixel outside the image after sampling.
        if(fittedLeft < -1 || fittedTop < -1 || fittedLeft+size>image.width+1 || fittedTop+size>image.height+1)return rough
        return RectF((max(0.0,fittedLeft)/image.width).toFloat(),(max(0.0,fittedTop)/image.height).toFloat(),(min(image.width.toDouble(),fittedLeft+size)/image.width).toFloat(),(min(image.height.toDouble(),fittedTop+size)/image.height).toFloat())
    }
    data class Observation(val placement: String, val confidence: Double)
    fun recognize(image: Bitmap): Observation? {
        diagnostic=""
        if (!calibrated) return null
        val rough=region?:locate(image)?:return null
        val box=if(gridReady)rough else refineInitialGrid(image,rough,false).also{region=it;gridReady=true}
        val pixels=IntArray(image.width*image.height)
        image.getPixels(pixels,0,image.width,0,0,image.width,image.height)
        // Compare each cell against the last classified frame, never against the
        // immediately preceding animation frame. Slow cumulative motion must count.
        val fingerprint=IntArray(64*24*24) { index->
            val cell=index/576;val sample=index%576
            val x=((box.left+(cell%8+.04f+(sample%24+.5f)/24*.92f)*box.width()/8)*image.width).toInt().coerceIn(0,image.width-1)
            val y=((box.top+(cell/8+.04f+(sample/24+.5f)/24*.92f)*box.height()/8)*image.height).toInt().coerceIn(0,image.height-1)
            pixels[y*image.width+x]
        }
        if(lastBlackBottom==blackBottom && lastObservation!=null && unchanged(fingerprint,lastFingerprint)) {
            reusedFrames++;return lastObservation
        }
        classifiedFrames++
        val features = features(image, box,pixels)
        val templates=banks[appearanceOf(image,box)]?:return null
        val labels = StringBuilder(); var confidence = 0.0
        var uncertain=0
        if(cachedTemplates!==templates) {
            cachedTemplates=templates;cachedFeatures.fill(null);cachedDistances.fill(null)
        }
        for ((index,feature) in features.withIndex()) {
            val distances = if(canReuseDistances(feature,cachedFeatures[index],cachedDistances[index]))cachedDistances[index]!! else templates.map { (piece, variants) ->
                var best=Double.POSITIVE_INFINITY
                for(variant in variants) {
                    if(best==0.0)break
                    best=min(best,distance(feature,variant,best))
                }
                piece to best
            }.sortedBy { it.second }.also {cachedFeatures[index]=feature;cachedDistances[index]=it}
            val first = distances[0]; val second = distances[1]
            if (first.second > 0.145 || second.second-first.second < 0.0025) {
                diagnostic+="$index:${first.first}/${first.second},${second.first}/${second.second} "
                // One uncertain square is retained only as a mask. The legal tracker
                // can accept it solely as the losing king in a unique checkmate.
                if(++uncertain>1)return null
                labels.append('?')
            } else {labels.append(first.first); confidence += (1-first.second).coerceIn(0.0,1.0)}
        }
        val physical = labels.toString(); val logical = if (blackBottom) physical.reversed() else physical
        val placement = (0..7).joinToString("/") { row ->
            val text=StringBuilder(); var empty=0
            for (col in 0..7) { val c=logical[row*8+col]; if(c=='.') empty++ else { if(empty>0) {text.append(empty);empty=0}; text.append(c) } }
            if(empty>0) text.append(empty); text.toString()
        }
        return Observation(placement, confidence/64).also {
            lastObservation=it;lastFingerprint=fingerprint;lastBlackBottom=blackBottom
        }
    }
    private fun unchanged(current: IntArray,previous: IntArray?): Boolean {
        if(previous==null || current.size!=previous.size)return false
        for(cell in 0..63) {
            var total=0
            for(i in cell*576 until (cell+1)*576)for(channel in 0..2) {
                val shift=channel*8
                val delta=abs(((current[i] shr shift)and 255)-((previous[i] shr shift)and 255))
                if(delta>12)return false
                total+=delta
            }
            // Tiny codec noise is ignored only when every cell remains unchanged.
            if(total>576*3)return false
        }
        return true
    }
    private fun distance(a: FloatArray,b: FloatArray,limit: Double): Double {
        // L1 terms are non-negative. Abandon a template only when it cannot beat
        // the same piece's best template; the top-two class margin stays exact.
        var total=0.0;val bound=limit*a.size
        for(i in a.indices) {
            total += abs(a[i]-b[i])
            if(total>=bound)return limit
        }
        return total/a.size
    }
    private fun canReuseDistances(current: FloatArray,previous: FloatArray?,distances: List<Pair<Char,Double>>?): Boolean {
        if(previous==null || distances==null)return false
        val delta=distance(current,previous,Double.POSITIVE_INFINITY)
        if(delta==0.0)return true
        // Triangle inequality: every template distance changes by at most delta.
        // Reuse only if BOTH the winning class and confidence decision are proven
        // unchanged. Keep the original feature so small changes accumulate.
        return distances[0].second+delta<0.145 && distances[1].second-distances[0].second-2*delta>=0.0025
    }
    private fun features(image: Bitmap, box: RectF, existingPixels: IntArray?=null): List<FloatArray> {
        val left=box.left*image.width; val top=box.top*image.height; val width=box.width()*image.width; val height=box.height()*image.height
        // One native copy replaces tens of thousands of Bitmap.getPixel JNI calls.
        val pixels=existingPixels?:IntArray(image.width*image.height).also {image.getPixels(it,0,image.width,0,0,image.width,image.height)}
        fun pixel(x: Float,y: Float)=pixels[y.toInt().coerceIn(0,image.height-1)*image.width+x.toInt().coerceIn(0,image.width-1)]
        return (0 until 64).map { index ->
            val col=index%8; val row=index/8
            // Estimate the dominant edge colour. Four corner averages are unstable near
            // antialiasing, coordinate labels, and a one-pixel crop error at grid boundaries.
            val bins=mutableMapOf<Int,MutableList<Int>>()
            for(sample in 0 until 16)for(edge in 0..3) {
                val step=(sample+.5f)/16;val dx=when(edge){0,1->step;2->.14f;else->.86f}
                val dy=when(edge){0->.14f;1->.86f;else->step}
                val color=pixel(left+(col+dx)*width/8,top+(row+dy)*height/8)
                val key=(((color shr 19)and 31)shl 10) or (((color shr 11)and 31)shl 5) or ((color shr 3)and 31)
                bins.getOrPut(key){mutableListOf()}.add(color)
            }
            val background=bins.values.maxBy{it.size};val bg=DoubleArray(3)
            for(color in background)for(c in 0..2)bg[c]+=((color shr(16-c*8))and 255).toDouble()/background.size
            val values=FloatArray(24*24*3)
            for(y in 0 until 24) for(x in 0 until 24) {
                val color=pixel(left+(col+.08f+(x+.5f)/24*.84f)*width/8,top+(row+.08f+(y+.5f)/24*.84f)*height/8)
                for(c in 0..2) values[(y*24+x)*3+c]=((((color shr (16-c*8)) and 255)-bg[c])/255).toFloat()
            }
            values
        }
    }
}

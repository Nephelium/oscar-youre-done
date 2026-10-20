package com.jingjing.chesssprout

import android.content.Context
import android.graphics.Bitmap
import android.graphics.RectF
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

class CapturePipeline(private val context: Context, options: JSONObject, val source: String) {
    val store = GameStore(context)
    var tracker = CaptureTracker()
        private set
    val recognizer = BoardRecognizer(options.optString("side") == "b")
    private val themeStore=ThemeStore(context)
    private val positionMode=options.optString("mode")=="position"
    private var positionConfirmed=!positionMode
    var pendingFen: String?=null
        private set
    val awaitingPosition: Boolean get()=!positionConfirmed
    val game: JSONObject
    private var previous = ""
    private var stable = 0
    private var badFrames = 0
    private var frames = 0
    private var lastIssue = ""
    var message = "等待标准初始棋盘，请先不要走子"
        private set
    init {
        if(positionMode)themeStore.load()?.let { recognizer.loadProfile(it) }
        if(positionMode)message="切回练习题，保持当前局面，识别后回本应用确认"
        options.optJSONObject("region")?.let { recognizer.region = rect(it) }
        val now=System.currentTimeMillis()
        game=JSONObject().put("schema",1).put("id","g"+UUID.randomUUID().toString().replace("-",""))
            .put("title", if(positionMode) "多邻国练习题" else if(source=="录屏导入") "录屏对局" else "多邻国对局")
            .put("createdAt",now).put("updatedAt",now).put("source",source).put("side",options.optString("side","w"))
            .put("initialFen",tracker.board.fen).put("moves",JSONArray()).put("result","*")
            .put("notebook",if(positionMode)"practice" else "game")
            .put("analysis",JSONObject()).put("branches",JSONArray()).put("issues",JSONArray())
            .put("capture",JSONObject().put("state","waiting").put("frames",0).put("mode",if(positionMode)"position" else "game"))
        store.save(game)
    }
    fun configure(options: JSONObject) {
        if(options.has("confirmFen")) {
            val fen=options.getString("confirmFen");val pending=pendingFen?:return
            require(fen.substringBefore(' ')==pending.substringBefore(' '))
            val fields=fen.split(' ');require(fields.size==6 && fields[1] in listOf("w","b") && fields[2].matches(Regex("-|K?Q?k?q?")) && fields[3].matches(Regex("-|[a-h][36]")))
            val confirmed=CaptureTracker(fen);require(confirmed.board.fen.substringBefore(' ')==pending.substringBefore(' '))
            tracker=confirmed;game.put("initialFen",confirmed.board.fen).put("updatedAt",System.currentTimeMillis())
            game.getJSONObject("capture").put("state","recording")
            positionConfirmed=true;pendingFen=null;previous="";stable=0
            message="练习局面已确认，可以继续走题";store.save(game);return
        }
        recognizer.blackBottom=options.optString("side","w")=="b"
        recognizer.reset(options.optJSONObject("region")?.let { rect(it) })
        if(positionMode)themeStore.load()?.let { recognizer.loadProfile(it) }
        pendingFen=null
        previous="";stable=0; message="正在重新定位初始棋盘"
    }
    fun onResize() {recognizer.region=null;previous="";stable=0}
    fun process(image: Bitmap) {
        frames++
        if(!recognizer.calibrated) {
            if(positionMode) {message="先在标准初始棋盘准备一次棋子样式，再记录练习题";return}
            if(frames%3 != 1) return
            if(!recognizer.calibrate(image)) { message="等待初始棋盘，可返回本应用框选棋盘"; return }
            themeStore.save(recognizer.profile())
            game.getJSONObject("capture").put("region", JSONObject().put("left",recognizer.region!!.left.toDouble()).put("top",recognizer.region!!.top.toDouble())
                .put("right",recognizer.region!!.right.toDouble()).put("bottom",recognizer.region!!.bottom.toDouble()))
            message="棋盘已就绪，可以开始下棋"; game.getJSONObject("capture").put("state","recording");store.save(game)
        }
        val observation=recognizer.recognize(image)
        if(observation==null) { badFrames++; if(badFrames>16) message="棋盘被遮挡或识别不清，等待清晰画面";return }
        badFrames=0
        if(observation.placement==previous) stable++ else {previous=observation.placement;stable=1}
        if(stable<2) return
        if(!positionConfirmed) {
            val placement=observation.placement
            if('?' in placement || placement.count{it=='K'}!=1 || placement.count{it=='k'}!=1) {message="请保持题目棋盘清晰，需包含双方的王";return}
            if(pendingFen==null)pendingFen="$placement w - - 0 1"
            message="练习局面已识别，请回本应用确认谁先走";return
        }
        var placement=observation.placement
        var change=tracker.accept(placement)
        if(change.kind in listOf("unmatched","ambiguous")) {
            val rotated=rotatePlacement(placement);val alternate=tracker.accept(rotated)
            if(alternate.kind in listOf("same","move","undo")){recognizer.blackBottom=!recognizer.blackBottom;change=alternate;placement=rotated}
        }
        when(change.kind) {
            "same" -> {message=if(tracker.moves.isEmpty())"棋盘已就绪，可以开始下棋" else "已记录 ${tracker.moves.size} 步"}
            "move","undo" -> {
                if(change.kind=="undo") {
                    val events=game.optJSONArray("undoEvents")?:JSONArray()
                    events.put(JSONObject().put("at",tracker.moves.size).put("removed",JSONArray(change.removed)))
                    game.put("undoEvents",events)
                }
                game.put("moves",JSONArray(tracker.moves)).put("updatedAt",System.currentTimeMillis())
                val issues=game.getJSONArray("issues")
                for(i in 0 until issues.length()) if(issues.getJSONObject(i).optInt("at")==tracker.moves.size-change.moves.size) issues.getJSONObject(i).put("resolved",true)
                game.getJSONObject("capture").put("frames",frames).put("state","recording")
                if(tracker.board.isMated) game.put("result",if(tracker.board.sideToMove.toString()=="WHITE") "0-1" else "1-0")
                else if(tracker.board.isStaleMate || tracker.board.isDraw) game.put("result","1/2-1/2")
                message="已记录 ${tracker.moves.size} 步";lastIssue="";store.save(game)
            }
            "unmatched","ambiguous" -> {
                if(stable>=4 && lastIssue!=placement && game.getJSONArray("issues").length()<100) {
                    lastIssue=placement
                    val imageName="${game.getString("id")}-${System.currentTimeMillis()}.jpg"
                    val folder=File(context.filesDir,"evidence").apply{mkdirs()}
                    // Only the board is retained for correction, never unrelated screen contents.
                    val r=recognizer.region!!
                    val x=(r.left*image.width).toInt().coerceIn(0,image.width-1);val y=(r.top*image.height).toInt().coerceIn(0,image.height-1)
                    val cropped=Bitmap.createBitmap(image,x,y,(r.width()*image.width).toInt().coerceIn(1,image.width-x),(r.height()*image.height).toInt().coerceIn(1,image.height-y))
                    File(folder,imageName).outputStream().use { cropped.compress(Bitmap.CompressFormat.JPEG,85,it) };if(cropped!==image)cropped.recycle()
                    val issues=game.getJSONArray("issues")
                    issues.put(JSONObject().put("at",tracker.moves.size).put("placement",placement)
                        .put("image",imageName).put("message","这里的走法需要核对，已保存棋盘画面").put("resolved",false))
                    message="有一处需要校对，正在继续观察";store.save(game)
                }
            }
        }
    }
    fun finish(reason: String="已保存，可以复盘") {
        if(!recognizer.calibrated || !positionConfirmed) game.getJSONArray("issues").put(JSONObject().put("at",0).put("message","尚未确认起始棋盘，请重新记录或导入棋谱").put("resolved",false))
        else if(badFrames>16 && !tracker.board.isMated && !tracker.board.isDraw) game.getJSONArray("issues").put(JSONObject().put("at",tracker.moves.size).put("message","结束前的画面未能确认，请核对最后几步是否完整").put("resolved",false))
        game.getJSONObject("capture").put("state","stopped").put("frames",frames).put("message",reason)
        game.put("updatedAt",System.currentTimeMillis()); store.save(game);message=reason
    }
    companion object {
        fun rotatePlacement(placement: String): String {
            val expanded=StringBuilder()
            for(c in placement)if(c in '1'..'8')repeat(c.digitToInt()){expanded.append('.')}else if(c!='/')expanded.append(c)
            require(expanded.length==64)
            val rotated=expanded.reverse().toString()
            return (0..7).joinToString("/"){row->val rank=StringBuilder();var empty=0
                for(c in rotated.substring(row*8,row*8+8)){if(c=='.')empty++ else{if(empty>0){rank.append(empty);empty=0};rank.append(c)}}
                if(empty>0)rank.append(empty);rank.toString()}
        }
        fun rect(j: JSONObject): RectF? {
            val r=RectF(j.optDouble("left",0.0).toFloat(),j.optDouble("top",0.0).toFloat(),j.optDouble("right",1.0).toFloat(),j.optDouble("bottom",1.0).toFloat())
            return if(r.left>=0 && r.top>=0 && r.right<=1 && r.bottom<=1 && r.width()>.15 && r.height()>.08)r else null
        }
    }
}

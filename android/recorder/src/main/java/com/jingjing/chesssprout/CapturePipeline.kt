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
    var tracker = CaptureTracker(options.optString("initialFen").ifBlank { com.github.bhlangonijr.chesslib.Board().fen })
        private set
    val recognizer = BoardRecognizer(options.optString("side") == "b")
    private val themeStore=ThemeStore(context)
    private val positionMode=options.optString("mode")=="position"
    private var positionConfirmed=!positionMode || options.has("initialFen")
    private var attemptCalibration=!positionMode && !options.has("initialFen")
    var pendingFen: String?=null
        private set
    val awaitingPosition: Boolean get()=!positionConfirmed
    var game: JSONObject
        private set
    private var recovery: CaptureRecovery?=null
    val confirmedPlies: Int get()=game.getJSONObject("capture").optInt("previousPlies")+tracker.moves.size
    private var previous = ""
    private var stable = 0
    private var badFrames = 0
    private var frames = 0
    private var lastIssue = ""
    private var unmatchedFrames=0
    var lastProcessMs=0L
        private set
    var message = "等待标准初始棋盘，请先不要走子"
        private set
    var feedbackSerial=0
        private set
    var feedback=""
        private set
    init {
        themeStore.load()?.let { recognizer.loadProfile(it) }
        if(positionMode)message="切回练习题，保持当前局面，识别后回本应用确认"
        options.optJSONObject("region")?.let { recognizer.region = rect(it) }
        val now=System.currentTimeMillis()
        game=JSONObject().put("schema",1).put("id","g"+UUID.randomUUID().toString().replace("-",""))
            .put("title", if(positionMode) {if(source=="录屏导入")"录屏练习题" else "多邻国练习题"} else if(source=="录屏导入") "录屏对局" else "多邻国对局")
            .put("createdAt",now).put("updatedAt",now).put("source",source).put("side",options.optString("side","w"))
            .put("initialFen",tracker.board.fen).put("moves",JSONArray()).put("result","*")
            .put("notebook",if(positionMode)"practice" else "game")
            .put("analysis",JSONObject()).put("branches",JSONArray()).put("issues",JSONArray())
            .put("capture",JSONObject().put("state","waiting").put("frames",0).put("mode",if(positionMode)"position" else "game"))
        store.save(game)
    }
    fun configure(options: JSONObject) {
        recovery=null;unmatchedFrames=0
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
        themeStore.load()?.let { recognizer.loadProfile(it) }
        attemptCalibration=!positionMode && tracker.moves.isEmpty()
        pendingFen=null
        previous="";stable=0; message="正在重新定位棋盘"
    }
    fun onResize() {recognizer.region=null;previous="";stable=0;unmatchedFrames=0;recovery=null}
    fun onInterrupted() {previous="";stable=0;unmatchedFrames=0;recovery=null}
    fun process(image: Bitmap) {
        val start=System.nanoTime()
        try {processFrame(image)} finally {lastProcessMs=(System.nanoTime()-start)/1_000_000}
    }
    private fun processFrame(image: Bitmap) {
        frames++
        // Prefer a verified initial-board calibration, but never label an opening
        // move as an empty square. A ready profile can recover a unique 1–2 ply start.
        if(attemptCalibration) {
            attemptCalibration=false
            val learner=BoardRecognizer(recognizer.blackBottom).apply {region=recognizer.region}
            if(learner.calibrate(image)) {
                recognizer.loadProfile(learner.profile());recognizer.region=learner.region
                recognizer.blackBottom=learner.blackBottom
                game.put("side",if(recognizer.blackBottom)"b" else "w")
                themeStore.save(learner.profile())
            }
        }
        if(!recognizer.calibrated) {
            if(positionMode) {message="棋子样式无法读取，请重新打开应用";return}
            if(frames%3 != 1) return
            if(!recognizer.calibrate(image)) { message="等待初始棋盘，可返回本应用框选棋盘"; return }
            themeStore.save(recognizer.profile())
            game.put("side",if(recognizer.blackBottom)"b" else "w")
            game.getJSONObject("capture").put("region", JSONObject().put("left",recognizer.region!!.left.toDouble()).put("top",recognizer.region!!.top.toDouble())
                .put("right",recognizer.region!!.right.toDouble()).put("bottom",recognizer.region!!.bottom.toDouble()))
            message="棋盘已就绪，可以开始下棋"; game.getJSONObject("capture").put("state","recording");store.save(game)
        }
        val observation=recognizer.recognize(image)
        if(observation==null) {
            previous="";stable=0
            badFrames++
            if(badFrames%8==0)recognizer.region=null
            if(badFrames%16==0 && !positionMode && tracker.moves.isEmpty())attemptCalibration=true
            if(badFrames>8)message="暂未看清棋盘，请等动画结束或框选棋盘"
            return
        }
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
        var beforeFen=tracker.board.fen
        var change=tracker.accept(placement)
        if(change.kind in listOf("unmatched","ambiguous") && tracker.moves.isEmpty()) {
            val rotated=rotatePlacement(placement);val alternate=tracker.accept(rotated)
            if(alternate.kind in listOf("same","move","undo")){recognizer.blackBottom=!recognizer.blackBottom;game.put("side",if(recognizer.blackBottom)"b" else "w");change=alternate;placement=rotated}
        }
        if(change.kind in listOf("unmatched","ambiguous") && stable>=3 && '?' !in placement) {
            val resumed=recovery?.takeIf{it.placement!=placement}?.follow(placement)
            if(resumed!=null) {
                beginContinuation(resumed,requireNotNull(recovery).placement)
                beforeFen=resumed.initialFen;change=resumed.change;recovery=null
            } else if(recovery?.placement!=placement) {
                recovery=CaptureRecovery(beforeFen,placement).takeIf{it.valid}
            }
        }
        when(change.kind) {
            "same" -> {
                unmatchedFrames=0;recovery=null
                message=if(tracker.moves.isEmpty())"棋盘已就绪，可以开始下棋" else "已记录 $confirmedPlies 步"
                if(game.getJSONObject("capture").optString("state")!="recording") {
                    game.getJSONObject("capture").put("state","recording");store.save(game)
                }
            }
            "move","undo" -> {
                unmatchedFrames=0;recovery=null
                feedback=if(change.kind=="undo")"已识别撤回 ${change.removed.size} 步" else
                    "已记录 $confirmedPlies 步 · "+CaptureTracker.describeMoves(beforeFen,change.moves)
                feedbackSerial++
                if(change.kind=="undo") {
                    val events=game.optJSONArray("undoEvents")?:JSONArray()
                    events.put(JSONObject().put("at",tracker.moves.size).put("removed",JSONArray(change.removed)))
                    game.put("undoEvents",events)
                    // Preserve the rejected attempt as a playable variation.
                    val branches=game.getJSONArray("branches")
                    if(branches.length()<200)branches.put(JSONObject().put("id",UUID.randomUUID().toString()).put("at",tracker.moves.size)
                        .put("moves",JSONArray(change.removed)).put("name","练习中撤回的尝试"))
                    game.put("result","*")
                }
                game.put("moves",JSONArray(tracker.moves)).put("updatedAt",System.currentTimeMillis())
                val issues=game.getJSONArray("issues")
                for(i in 0 until issues.length()) if(issues.getJSONObject(i).optInt("at")==tracker.moves.size-change.moves.size) issues.getJSONObject(i).put("resolved",true)
                game.getJSONObject("capture").put("frames",frames).put("state","recording")
                if(tracker.board.isMated) game.put("result",if(tracker.board.sideToMove.toString()=="WHITE") "0-1" else "1-0")
                else if(tracker.board.isStaleMate || tracker.board.isDraw) game.put("result","1/2-1/2")
                message="已记录 $confirmedPlies 步";lastIssue="";store.save(game)
            }
            "unmatched","ambiguous" -> {
                unmatchedFrames++
                // A plausible but shifted grid can return labels forever. Retry
                // localization even when recognition is non-null, at a bounded rate.
                if(unmatchedFrames%8==0) {
                    recognizer.region=null;previous="";stable=0
                }
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
    private fun beginContinuation(resumed: CaptureRecovery.Recovered,anchor: String) {
        val prior=game
        val capture=prior.getJSONObject("capture")
        val now=System.currentTimeMillis()
        val id="g"+UUID.randomUUID().toString().replace("-","")
        val number=capture.optInt("segment",1)+1
        val total=confirmedPlies
        val rootId=capture.optString("rootId",prior.getString("id"))
        val rootTitle=capture.optString("rootTitle",prior.getString("title"))
        val issues=prior.getJSONArray("issues")
        val existing=(0 until issues.length()).map{issues.getJSONObject(it)}
            .lastOrNull{it.optInt("at")==tracker.moves.size && it.optString("placement")==anchor && !it.optBoolean("resolved")}
        val issue=existing?:JSONObject().put("at",tracker.moves.size).put("placement",anchor).also{issues.put(it)}
        issue.put("continuationId",id).put("message","中间走法待校对，已从后面清楚的局面继续记录").put("resolved",false)
        capture.put("state","interrupted").put("nextId",id).put("rootId",rootId).put("rootTitle",rootTitle).put("segment",number-1)
        prior.put("updatedAt",now);store.save(prior)
        game=JSONObject().put("schema",1).put("id",id).put("title","$rootTitle · 续录 ${number-1}")
            .put("createdAt",now).put("updatedAt",now).put("source",source).put("side",prior.getString("side"))
            .put("initialFen",resumed.initialFen).put("moves",JSONArray()).put("result","*")
            .put("notebook",prior.getString("notebook")).put("analysis",JSONObject()).put("branches",JSONArray()).put("issues",JSONArray())
            .put("capture",JSONObject().put("state","recording").put("mode",capture.optString("mode"))
                .put("rootId",rootId).put("rootTitle",rootTitle).put("previousId",prior.getString("id"))
                .put("previousPlies",total).put("segment",number).put("rightsEstimated",true))
        tracker=resumed.tracker;lastIssue="";unmatchedFrames=0
    }
    fun finish(reason: String="已保存，可以复盘") {
        if(!recognizer.calibrated || !positionConfirmed || game.getJSONObject("capture").optString("state")!="recording") game.getJSONArray("issues").put(JSONObject().put("at",0).put("message","尚未确认起始棋盘，请重新记录或导入棋谱").put("resolved",false))
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

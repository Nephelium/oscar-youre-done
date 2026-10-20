package com.jingjing.chesssprout

import android.content.Context
import com.github.bhlangonijr.chesslib.Board
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedWriter
import java.io.File
import java.io.IOException
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

data class UciLine(val rank: Int, val depth: Int, val cp: Int?, val mate: Int?, val pv: List<String>, val wdl: List<Int>? = null)
object UciParser {
    fun parse(line: String, whiteToMove: Boolean): UciLine? {
        val parts = line.trim().split(Regex("\\s+"))
        if (parts.firstOrNull() != "info" || "pv" !in parts || "score" !in parts || "lowerbound" in parts || "upperbound" in parts) return null
        fun number(key: String): Int? { val i = parts.indexOf(key); return if (i >= 0) parts.getOrNull(i+1)?.toIntOrNull() else null }
        val score = parts.indexOf("score"); val kind = parts.getOrNull(score+1); val value = parts.getOrNull(score+2)?.toIntOrNull() ?: return null
        val sign = if (whiteToMove) 1 else -1
        val wdlAt = parts.indexOf("wdl")
        val wdl = if (wdlAt < 0) null else parts.drop(wdlAt + 1).take(3).mapNotNull { it.toIntOrNull() }
            .takeIf { it.size == 3 && it.all { n -> n in 0..1000 } && it.sum() == 1000 }
        return UciLine(number("multipv") ?: 1, number("depth") ?: 0, if (kind == "cp") value * sign else null,
            if (kind == "mate") value * sign else null, parts.drop(parts.indexOf("pv")+1).takeWhile { it.matches(Regex("[a-h][1-8][a-h][1-8][qrbn]?")) },
            if (whiteToMove) wdl else wdl?.reversed())
    }
}

class StockfishEngine(private val context: Context) {
    private var process: Process? = null
    private var writer: BufferedWriter? = null
    private var lines = LinkedBlockingQueue<String>()
    val generation = AtomicInteger(0)
    @Volatile var name = if(android.os.Build.SUPPORTED_ABIS.firstOrNull()=="x86_64")"Stockfish 16.1" else "Stockfish 19"
    private fun send(command: String) { synchronized(this) { writer?.apply { write(command); newLine(); flush() } ?: error("引擎尚未启动") } }
    fun cancel() { generation.incrementAndGet(); runCatching { send("stop") } }
    private fun start() {
        if (process?.isAlive == true) return
        val binary = File(context.applicationInfo.nativeLibraryDir, "libstockfish.so")
        check(binary.isFile) { "当前设备架构暂不支持本地引擎" }
        lines = LinkedBlockingQueue()
        val queue = lines
        val launched=ProcessBuilder(binary.absolutePath).redirectErrorStream(true).start()
        process=launched
        writer = launched.outputStream.bufferedWriter()
        Thread({
            try {
                launched.inputStream.bufferedReader().useLines { stream -> stream.forEach { queue.offer(it) } }
            } catch (_: IOException) {
                // Closing/restarting the process interrupts this read. Notify the
                // waiting request through its queue instead of crashing the app.
            } finally { queue.offer("__closed__") }
        }, "stockfish-output").apply { isDaemon = true; start() }
        send("uci")
        val options = mutableListOf<String>()
        waitUntil(25000) { line ->
            if (line.startsWith("id name ")) name = line.removePrefix("id name ")
            if (line.startsWith("option name ")) options.add(line)
            line == "uciok"
        }
        send("setoption name Threads value 2")
        send("setoption name Hash value 32")
        send("setoption name MultiPV value 3")
        if (options.any { it.startsWith("option name UCI_ShowWDL ") }) send("setoption name UCI_ShowWDL value true")
        val networkDir = File(context.filesDir, "networks").apply { mkdirs() }
        val networkFiles = runCatching { context.assets.list("networks")?.toList() ?: emptyList() }.getOrDefault(emptyList())
        for (network in networkFiles) {
            val target = File(networkDir, network)
            if (!target.isFile) context.assets.open("networks/$network").use { source -> target.outputStream().use { source.copyTo(it) } }
            if (options.any { it.contains("name EvalFile ") && it.contains(network) }) send("setoption name EvalFile value ${target.absolutePath}")
            if (options.any { it.contains("name EvalFileSmall ") && it.contains(network) }) send("setoption name EvalFileSmall value ${target.absolutePath}")
        }
        send("isready"); waitUntil(25000) { it == "readyok" }
    }
    fun analyze(fen: String, budget: Int, token: Int, depthLimit: Int? = null, infinite: Boolean = false, onUpdate: ((JSONObject)->Unit)? = null): JSONObject {
        require(depthLimit == null || depthLimit in 1..40)
        require(fen.length < 140 && !fen.contains('\n') && !fen.contains('\r'))
        val board = Board().apply { loadFromFen(fen) }
        if (board.isMated || board.isStaleMate || board.isDraw) {
            val mate = if (board.isMated) (if (fen.split(' ')[1] == "w") -1 else 1) else null
            return JSONObject().put("engine", name).put("budget", budget).put("lines", JSONArray().put(JSONObject().put("depth",0)
                .put("cp", if(mate==null)0 else mate*100000).put("mate", if(mate==null)JSONObject.NULL else 0).put("terminal",true)
                .put("wdl", JSONArray(if(mate==null)listOf(0,1000,0) else if(mate>0)listOf(1000,0,0) else listOf(0,0,1000))).put("pv", JSONArray())))
        }
        try {
            start()
            check(token == generation.get()) { "分析已暂停" }
            send("setoption name Skill Level value 20")
            send("setoption name UCI_LimitStrength value false")
            send("setoption name MultiPV value 3")
            send("isready"); waitUntil(5000) { it == "readyok" }
            send("position fen $fen")
            send(if(infinite) "go infinite" else "go movetime ${budget.coerceIn(200, 5000)}${depthLimit?.let { " depth $it" } ?: ""}")
            val results = sortedMapOf<Int, UciLine>()
            val started=System.nanoTime();var lastUpdate=0L
            fun result(elapsed: Int): JSONObject = JSONObject().put("engine", name).put("budget", elapsed).put("lines", JSONArray(results.values.take(3).map { l ->
                JSONObject().put("depth", l.depth).put("cp", l.cp ?: JSONObject.NULL).put("mate", l.mate ?: JSONObject.NULL).put("pv", JSONArray(l.pv))
                    .apply { l.wdl?.let { put("wdl", JSONArray(it)) } }
            }))
            waitUntil(if(infinite)0 else budget.coerceIn(200,5000).toLong() + 15000) { line ->
                UciParser.parse(line, fen.split(' ')[1] == "w")?.let {
                    results[it.rank] = it
                    val elapsed=TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started)
                    if(onUpdate!=null && token==generation.get() && results.containsKey(1) && elapsed-lastUpdate>=400){
                        lastUpdate=elapsed;onUpdate(result(elapsed.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()))
                    }
                }
                line.startsWith("bestmove ")
            }
            check(token == generation.get()) { "分析已暂停" }
            check(results.isNotEmpty()) { "引擎未返回分析结果，请重试" }
            return result(if(infinite)TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started).coerceAtMost(Int.MAX_VALUE.toLong()).toInt() else budget)

        } catch (error: Exception) { if (token == generation.get()) close(); throw error }
    }
    // Use the complete played line so repetition and the fifty-move rule remain meaningful.
    // Skill Level may choose a move other than the top PV: consume bestmove itself.
    fun play(initialFen: String, moves: List<String>, skill: Int, token: Int): JSONObject {
        require(initialFen.length < 140 && !initialFen.contains('\n') && !initialFen.contains('\r'))
        require(moves.size <= 6000 && moves.all { it.matches(Regex("[a-h][1-8][a-h][1-8][qrbn]?")) })
        require(skill in 0..20)
        val board = Board().apply { loadFromFen(initialFen) }
        for (move in moves) check(board.doMove(com.github.bhlangonijr.chesslib.move.Move(move, board.sideToMove), true)) { "对局走法无法重放" }
        check(!board.isMated && !board.isDraw && !board.isStaleMate) { "对局已经结束" }
        try {
            start()
            check(token == generation.get()) { "对战已暂停" }
            send("setoption name UCI_LimitStrength value false")
            send("setoption name Skill Level value $skill")
            send("setoption name MultiPV value 1")
            send("isready"); waitUntil(5000) { it == "readyok" }
            send("position fen $initialFen${if(moves.isEmpty()) "" else " moves ${moves.joinToString(" ")}"}")
            send("go movetime ${350 + skill * 25}")
            var best = ""
            waitUntil(16000) { line ->
                if (line.startsWith("bestmove ")) { best=line.split(' ').getOrElse(1){""};true } else false
            }
            check(token == generation.get()) { "对战已暂停" }
            check(best.matches(Regex("[a-h][1-8][a-h][1-8][qrbn]?")) &&
                board.doMove(com.github.bhlangonijr.chesslib.move.Move(best, board.sideToMove), true)) { "引擎未返回合法应手，请重试" }
            return JSONObject().put("move",best).put("skill",skill).put("engine",name)
        } catch (error: Exception) { if (token == generation.get()) close(); throw error }
    }
    private fun waitUntil(timeout: Long, done: (String)->Boolean) {
        val deadline = if(timeout==0L)Long.MAX_VALUE else System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeout)
        while (System.nanoTime() < deadline) {
            val line = lines.poll(250, TimeUnit.MILLISECONDS) ?: continue
            check(line != "__closed__") { "本地引擎已退出，请重试" }
            if (done(line)) return
        }
        error("本地引擎响应超时，请重试")
    }
    fun close() { runCatching { send("quit") }; process?.destroy(); process = null; writer = null }
}

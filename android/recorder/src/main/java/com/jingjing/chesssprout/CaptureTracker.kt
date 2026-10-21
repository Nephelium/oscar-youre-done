package com.jingjing.chesssprout

import com.github.bhlangonijr.chesslib.Board
import com.github.bhlangonijr.chesslib.Piece
import com.github.bhlangonijr.chesslib.PieceType
import com.github.bhlangonijr.chesslib.Side
import com.github.bhlangonijr.chesslib.move.Move

/** Exact placement matching against mature legal-move generation. Ambiguity never becomes a guessed move. */
class CaptureTracker(initialFen: String = Board().fen, moves: List<String> = emptyList()) {
    companion object {
        fun describeMoves(fen: String,inputs: List<String>): String {
            val board=Board().apply{loadFromFen(fen)}
            val names=mapOf("PAWN" to "兵","KNIGHT" to "马","BISHOP" to "象","ROOK" to "车","QUEEN" to "后","KING" to "王")
            return inputs.joinToString(" · ") {input->
                val move=Move(input,board.sideToMove);val piece=board.getPiece(move.from)
                val side=if(board.sideToMove.toString()=="WHITE")"白" else "黑"
                val label=if(piece.pieceType.toString()=="KING" && kotlin.math.abs(input[0]-input[2])==2)
                    side+"方"+if(input[2]=='g')"短易位" else "长易位"
                else side+names[piece.pieceType.toString()]+input.substring(2,4)+
                    if(input.length==5)"升"+mapOf('q' to "后",'r' to "车",'b' to "象",'n' to "马")[input[4]] else ""
                check(board.doMove(move,true));label
            }
        }
    }
    val board = Board().apply { loadFromFen(initialFen) }
    val moves = mutableListOf<String>()
    private val positions = mutableListOf(initialFen)
    init { moves.forEach { input -> val m = Move(input, board.sideToMove); require(board.doMove(m, true)); this.moves.add(input); positions.add(board.fen) } }
    data class Change(val kind: String, val moves: List<String> = emptyList(), val removed: List<String> = emptyList())
    private val failures=linkedMapOf<String,Change>()
    var lastSearchNodes=0
        private set
    var lastSearchLimited=false
        private set
    fun accept(placement: String, maxGap: Int=4, nodeBudget: Int=12_000): Change {
        require(maxGap in 1..4 && nodeBudget>=0)
        lastSearchNodes=0;lastSearchLimited=false
        val current=board.fen.substringBefore(' ')
        if (placement == current || maskedSameMatches(current,placement) || terminalMaskMatches(current,placement)) return Change("same")
        val key="$placement:$maxGap:$nodeBudget"
        failures[key]?.let{return it}
        val observed=expand(placement)
        if(observed.length!=64 || observed.any{it !in ".?prnbqkPRNBQK"} ||
            observed.count{it=='K'}>1 || observed.count{it=='k'}>1 ||
            ('K' !in observed && 'k' !in observed))return Change("unmatched")
        val expected=expand(current)
        val differences=observed.indices.filter{observed[it]!=expected[it]}
        // A selected/enlarged piece can be mistaken for another shape or empty.
        // A legal move changes at least two squares (mate animation handled above).
        // Ignore this transient observation without altering any stored position.
        if(differences.size==1 && expected[differences.single()]!='.')return Change("same")
        val targets=Piece.entries.filter{it!=Piece.NONE}.associateWith{piece->
            var mask=0L
            for(i in observed.indices)if(observed[i]==piece.fenSymbol[0])mask=mask or (1L shl ((7-i/8)*8+i%8))
            mask
        }
        val complete=observed.count{it=='K'}==1 && observed.count{it=='k'}==1 && '?' !in observed
        val targetCount=targets.values.sumOf{java.lang.Long.bitCount(it)}
        val targetSideCounts=Side.entries.associateWith{side->targets.filterKeys{it.pieceSide==side}.values.sumOf{java.lang.Long.bitCount(it)}}
        // A move can place one piece on a missing target square. Castling is the
        // sole exception: allow one extra placement when both king and rook lack
        // target squares. This lower bound also handles captures and promotion.
        fun reachable(remaining: Int): Boolean {
            if(complete && java.lang.Long.bitCount(board.bitboard)-targetCount>remaining)return false
            for(side in Side.entries) {
                var needed=0;var kingMissing=false;var rookMissing=false
                for((piece,target) in targets)if(piece.pieceSide==side) {
                    val count=java.lang.Long.bitCount(target and board.getBitboard(piece).inv())
                    needed+=count
                    if(piece.pieceType==PieceType.KING)kingMissing=count>0
                    if(piece.pieceType==PieceType.ROOK)rookMissing=count>0
                }
                val turns=(remaining+if(board.sideToMove==side)1 else 0)/2
                if(complete && java.lang.Long.bitCount(board.getBitboard(side))-targetSideCounts.getValue(side)>remaining-turns)return false
                if(needed>turns+if(kingMissing && rookMissing && turns>0)1 else 0)return false
            }
            return true
        }
        var deadline=Long.MAX_VALUE
        val path=mutableListOf<String>()
        val matches=mutableListOf<List<String>>()
        fun search(remaining: Int) {
            if(matches.size>1 || lastSearchLimited)return
            if(++lastSearchNodes>nodeBudget || System.nanoTime()>deadline) {lastSearchLimited=true;return}
            if(remaining==0) {
                val exact=targets.all{(piece,target)->board.getBitboard(piece)==target}
                if(exact && complete || !complete && terminalMaskMatches(board.fen.substringBefore(' '),placement))matches.add(path.toList())
                return
            }
            if(!reachable(remaining))return
            for(move in board.legalMoves()) {
                if(remaining==1 && complete) {
                    val from=move.from.ordinal;val to=move.to.ordinal
                    val atTo=if(move.promotion!=Piece.NONE)move.promotion else board.getPiece(move.from)
                    if(observed[(7-from/8)*8+from%8]!='.' || observed[(7-to/8)*8+to%8]!=atTo.fenSymbol[0])continue
                }
                board.doMove(move);path.add(move.toString())
                try {search(remaining-1)} finally {path.removeAt(path.lastIndex);board.undoMove()}
                if(matches.size>1 || lastSearchLimited)return
            }
        }
        fun failure(kind: String): Change {
            val result=Change(kind)
            // A time-limited search may complete on another pass after warm-up.
            // Fully explored failures stay cached until the confirmed board changes.
            if(!lastSearchLimited) {
                if(failures.size>=16)failures.remove(failures.keys.first())
                failures[key]=result
            }
            return result
        }
        for(depth in 1..maxGap) {
            if(depth==3) {
                // Exercises return to a previously observed position. Prefer that
                // evidence over inventing a longer forward cycle.
                rollback(placement)?.let{return it}
                deadline=System.nanoTime()+160_000_000L
            }
            search(depth)
            if(lastSearchLimited)return failure("unmatched")
            if(matches.size>1)return failure("ambiguous")
            if(matches.size==1)return commit(matches.first())
        }
        if(maxGap<3)rollback(placement)?.let{return it}
        return failure("unmatched")
    }
    private fun rollback(placement: String): Change? {
        for(index in positions.lastIndex-1 downTo 0)if(positions[index].substringBefore(' ')==placement) {
            val removed=moves.drop(index)
            while(moves.size>index){moves.removeAt(moves.lastIndex);positions.removeAt(positions.lastIndex)}
            board.loadFromFen(positions.last());failures.clear()
            return Change("undo",removed=removed)
        }
        return null
    }
    private fun expand(text: String): String=buildString {
        for(c in text)if(c in '1'..'8')repeat(c.digitToInt()){append('.')}else if(c!='/')append(c)
    }
    private fun commit(inputs: List<String>): Change {
        for (input in inputs) { check(board.doMove(Move(input, board.sideToMove), true)); moves.add(input); positions.add(board.fen) }
        failures.clear()
        return Change("move", inputs)
    }
    private fun terminalMaskMatches(expected: String,observed: String): Boolean {
        if('K' in observed && 'k' in observed)return false
        fun expand(text: String): String=buildString { for(c in text)if(c in '1'..'8')repeat(c.digitToInt()){append('.')}else if(c!='/')append(c) }
        val a=expand(expected);val b=expand(observed);if(a.length!=64 || b.length!=64)return false
        val king=if(board.sideToMove.toString()=="WHITE") 'K' else 'k'
        val kingIndex=a.indexOf(king);if(kingIndex<0 || b[kingIndex] !in charArrayOf('?','.'))return false
        return a.indices.all { it==kingIndex || a[it]==b[it] } && board.isMated
    }
    private fun maskedSameMatches(expected: String,observed: String): Boolean {
        if(observed.count{it=='?'}!=1)return false
        fun expand(text: String): String=buildString {for(c in text)if(c in '1'..'8')repeat(c.digitToInt()){append('.')}else if(c!='/')append(c)}
        val a=expand(expected);val b=expand(observed)
        return a.length==64 && b.length==64 && a.indices.all{b[it]=='?' || a[it]==b[it]}
    }
}

package com.jingjing.chesssprout

import com.github.bhlangonijr.chesslib.Board
import com.github.bhlangonijr.chesslib.move.Move

/** Exact placement matching against mature legal-move generation. Ambiguity never becomes a guessed move. */
class CaptureTracker(initialFen: String = Board().fen, moves: List<String> = emptyList()) {
    val board = Board().apply { loadFromFen(initialFen) }
    val moves = mutableListOf<String>()
    private val positions = mutableListOf(initialFen)
    init { moves.forEach { input -> val m = Move(input, board.sideToMove); require(board.doMove(m, true)); this.moves.add(input); positions.add(board.fen) } }
    data class Change(val kind: String, val moves: List<String> = emptyList(), val removed: List<String> = emptyList())
    fun accept(placement: String): Change {
        if (placement == board.fen.substringBefore(' ') || maskedSameMatches(board.fen.substringBefore(' '),placement) || terminalMaskMatches(board.fen.substringBefore(' '),placement,board.isMated)) return Change("same")
        for (index in positions.lastIndex - 1 downTo maxOf(0, positions.lastIndex - 2)) {
            if (positions[index].substringBefore(' ') == placement) {
                val removed = moves.drop(index)
                while (moves.size > index) { moves.removeAt(moves.lastIndex); positions.removeAt(positions.lastIndex) }
                board.loadFromFen(positions.last()); return Change("undo", removed = removed)
            }
        }
        val matches = mutableListOf<List<String>>()
        for (first in board.legalMoves()) {
            board.doMove(first)
            val target=board.fen.substringBefore(' ')
            if (target == placement || terminalMaskMatches(target,placement,board.isMated)) matches.add(listOf(first.toString()))
            board.undoMove()
        }
        if (matches.size == 1) return commit(matches.first())
        if (matches.size > 1) return Change("ambiguous")
        for (first in board.legalMoves()) {
            board.doMove(first)
            for (second in board.legalMoves()) {
                board.doMove(second)
                val target=board.fen.substringBefore(' ')
                if (target == placement || terminalMaskMatches(target,placement,board.isMated)) matches.add(listOf(first.toString(), second.toString()))
                board.undoMove()
                if (matches.size > 1) break
            }
            board.undoMove()
            if (matches.size > 1) break
        }
        return if (matches.size == 1) commit(matches.first()) else Change(if (matches.isEmpty()) "unmatched" else "ambiguous")
    }
    private fun commit(inputs: List<String>): Change {
        for (input in inputs) { check(board.doMove(Move(input, board.sideToMove), true)); moves.add(input); positions.add(board.fen) }
        return Change("move", inputs)
    }
    private fun terminalMaskMatches(expected: String,observed: String,mated: Boolean): Boolean {
        if(!mated)return false
        fun expand(text: String): String=buildString { for(c in text)if(c in '1'..'8')repeat(c.digitToInt()){append('.')}else if(c!='/')append(c) }
        val a=expand(expected);val b=expand(observed);if(a.length!=64 || b.length!=64)return false
        val king=if(board.sideToMove.toString()=="WHITE") 'K' else 'k'
        val kingIndex=a.indexOf(king);if(kingIndex<0 || b[kingIndex] !in charArrayOf('?','.'))return false
        return a.indices.all { it==kingIndex || a[it]==b[it] }
    }
    private fun maskedSameMatches(expected: String,observed: String): Boolean {
        if(observed.count{it=='?'}!=1)return false
        fun expand(text: String): String=buildString {for(c in text)if(c in '1'..'8')repeat(c.digitToInt()){append('.')}else if(c!='/')append(c)}
        val a=expand(expected);val b=expand(observed)
        return a.length==64 && b.length==64 && a.indices.all{b[it]=='?' || a[it]==b[it]}
    }
}

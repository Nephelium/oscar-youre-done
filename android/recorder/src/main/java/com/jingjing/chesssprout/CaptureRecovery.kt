package com.jingjing.chesssprout

import com.github.bhlangonijr.chesslib.Board
import com.github.bhlangonijr.chesslib.Piece
import com.github.bhlangonijr.chesslib.Side
import com.github.bhlangonijr.chesslib.Square

/** A disconnected segment never pretends to reconstruct the missing history. */
class CaptureRecovery(private val previousFen: String, val placement: String) {
    data class Recovered(val initialFen: String,val tracker: CaptureTracker,val change: CaptureTracker.Change)
    private val candidates=mutableListOf<String>()
    init {
        val known=Board().apply{loadFromFen(previousFen)}
        if('?' !in placement && placement.count{it=='K'}==1 && placement.count{it=='k'}==1) {
            for(turn in listOf("w","b"))runCatching {
                val base=Board().apply{loadFromFen("$placement $turn - - 0 1")}
                require(java.lang.Long.bitCount(base.bitboard)<=java.lang.Long.bitCount(known.bitboard))
                // The side that just moved cannot have left its own king in check.
                require(base.squareAttackedBy(base.getKingSquare(base.sideToMove.flip()),base.sideToMove)==0L)
                for(side in Side.entries)require(java.lang.Long.bitCount(base.getBitboard(side))<=java.lang.Long.bitCount(known.getBitboard(side)))
                require((base.getBitboard(Piece.WHITE_PAWN) or base.getBitboard(Piece.BLACK_PAWN)) and (0xffL or (0xffL shl 56)) == 0L)
                val rights=buildString {
                    val old=previousFen.split(' ')[2]
                    for((right,king,rook) in listOf(Triple('K',Square.E1,Square.H1),Triple('Q',Square.E1,Square.A1),
                        Triple('k',Square.E8,Square.H8),Triple('q',Square.E8,Square.A8))) {
                        val side=if(right.isUpperCase())Side.WHITE else Side.BLACK
                        if(right in old && base.getPiece(king)==Piece.make(side,com.github.bhlangonijr.chesslib.PieceType.KING) &&
                            base.getPiece(rook)==Piece.make(side,com.github.bhlangonijr.chesslib.PieceType.ROOK))append(right)
                    }
                }.ifEmpty{"-"}
                candidates.add("$placement $turn $rights - 0 1")
                // Only a following legal en-passant capture can select one of these
                // alternatives. A picture alone cannot establish a double pawn push.
                val pawn=if(turn=="w")Piece.BLACK_PAWN else Piece.WHITE_PAWN
                val rank=if(turn=="w")5 else 4;val epRank=if(turn=="w")6 else 3
                val ownPawn=if(turn=="w")Piece.WHITE_PAWN else Piece.BLACK_PAWN
                for(file in 'a'..'h')if(base.getPiece(Square.valueOf("$file$rank".uppercase()))==pawn &&
                    listOf(file-1,file+1).any{it in 'a'..'h' && base.getPiece(Square.valueOf("$it$rank".uppercase()))==ownPawn})
                    candidates.add("$placement $turn $rights $file$epRank 0 1")
            }
        }
    }
    val valid: Boolean get()=candidates.isNotEmpty()
    fun follow(observed: String): Recovered? {
        val matches=candidates.mapNotNull { fen->
            val tracker=CaptureTracker(fen)
            val change=tracker.accept(observed,maxGap=2)
            if(change.kind=="move")Recovered(fen,tracker,change) else null
        }.distinctBy {it.initialFen.split(' ')[1] to it.change.moves}
        return matches.singleOrNull()
    }
}

(function () {
  const FILES = "abcdefgh";
  const SLIDERS = {
    b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]
  };

  function inside(file, rank) {
    return file >= 0 && file < 8 && rank >= 1 && rank <= 8;
  }

  function squareName(file, rank) {
    return `${FILES[file]}${rank}`;
  }

  function addControl(map, color, square) {
    if (!map[square]) map[square] = { w: 0, b: 0 };
    map[square][color] += 1;
  }

  function pieceAt(board, file, rank) {
    const row = 8 - rank;
    return board[row] ? board[row][file] : null;
  }

  function addLeaper(map, color, file, rank, offsets) {
    offsets.forEach(([df, dr]) => {
      const nf = file + df;
      const nr = rank + dr;
      if (inside(nf, nr)) addControl(map, color, squareName(nf, nr));
    });
  }

  function addSlider(map, board, color, file, rank, directions) {
    directions.forEach(([df, dr]) => {
      let nf = file + df;
      let nr = rank + dr;
      while (inside(nf, nr)) {
        addControl(map, color, squareName(nf, nr));
        if (pieceAt(board, nf, nr)) break;
        nf += df;
        nr += dr;
      }
    });
  }

  function computeControlMap(chess) {
    const board = chess.board();
    const map = {};
    board.forEach((row, rowIndex) => {
      row.forEach((piece, file) => {
        if (!piece) return;
        const rank = 8 - rowIndex;
        if (piece.type === "p") {
          const direction = piece.color === "w" ? 1 : -1;
          addLeaper(map, piece.color, file, rank, [[-1, direction], [1, direction]]);
        } else if (piece.type === "n") {
          addLeaper(map, piece.color, file, rank, [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]);
        } else if (piece.type === "k") {
          addLeaper(map, piece.color, file, rank, [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]]);
        } else {
          addSlider(map, board, piece.color, file, rank, SLIDERS[piece.type]);
        }
      });
    });
    return map;
  }

  window.ControlMap = {
    compute: computeControlMap
  };
})();

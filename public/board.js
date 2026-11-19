const LudoBoard = (() => {
  const CELL = 40;                  // 600/15
  const COLORS = ['red', 'green', 'yellow', 'blue'];

  const HEX = {
    red:    '#e63946',
    green:  '#2a9d8f',
    yellow: '#f4a261',
    blue:   '#457b9d'
  };
  const HEX_LIGHT = {
    red:    '#ffd6da',
    green:  '#c5e8e3',
    yellow: '#fde4c7',
    blue:   '#cfe0ed'
  };

  // 52-cell outer path (row, col)
  const PATH = [
    [6,1],[6,2],[6,3],[6,4],[6,5],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],
    [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
    [7,14],
    [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
    [14,7],
    [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],
    [6,0]
  ];

  const STARTS = { red: 0, green: 13, yellow: 26, blue: 39 };
  const SAFE   = [0, 8, 13, 21, 26, 34, 39, 47];

  const HOME_COL = {
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5]],
    green:  [[1,7],[2,7],[3,7],[4,7],[5,7]],
    yellow: [[7,13],[7,12],[7,11],[7,10],[7,9]],
    blue:   [[13,8],[12,8],[11,8],[10,8],[9,8]]
  };

  const HOME_POS = {
    red:    [7,6],
    green:  [6,7],
    yellow: [7,8],
    blue:   [8,8]
  };

  const BASE_POS = {
    red:    [[1,1],[1,3],[3,1],[3,3]],
    green:  [[1,11],[1,13],[3,11],[3,13]],
    yellow: [[11,11],[11,13],[13,11],[13,13]],
    blue:   [[11,1],[11,3],[13,1],[13,3]]
  };

  // ============ POSITION TO PIXEL ============
  function cellToXY(row, col) {
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
  }
  function posToXY(color, pos, tokenIdx) {
    let cell;
    if (pos === -1) {
      cell = BASE_POS[color][tokenIdx];
    } else if (pos <= 50) {
      cell = PATH[(STARTS[color] + pos) % 52];
    } else if (pos <= 55) {
      cell = HOME_COL[color][pos - 51];
    } else {
      cell = HOME_POS[color];
    }
    return cellToXY(cell[0], cell[1]);
  }

  // ============ BACKGROUND CANVAS ============
  let bg = null;

  function getBG() {
    if (bg) return bg;
    const c = document.createElement('canvas');
    c.width = 600; c.height = 600;
    const x = c.getContext('2d');

    // white background
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 600, 600);

    // ---- four home squares ----
    drawHomeSquare(x, 0, 0, 'red');
    drawHomeSquare(x, 9 * CELL, 0, 'green');
    drawHomeSquare(x, 9 * CELL, 9 * CELL, 'yellow');
    drawHomeSquare(x, 0, 9 * CELL, 'blue');

    // ---- path cells ----
    PATH.forEach(([r, c], i) => {
      let fill = '#ffffff';
      let stroke = '#cfd6e4';
      // color-coded start cells
      for (const color of COLORS) {
        if (i === STARTS[color]) { fill = HEX[color]; stroke = HEX[color]; }
      }
      // safe star cells
      if (SAFE.includes(i) && !Object.values(STARTS).includes(i)) {
        fill = '#f0f3f9';
      }
      const px = c * CELL, py = r * CELL;
      x.fillStyle = fill;
      x.strokeStyle = stroke;
      x.lineWidth = 2;
      x.beginPath();
      x.roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 6);
      x.fill();
      x.stroke();

      // safe star
      if (SAFE.includes(i)) {
        drawStar(x, px + CELL / 2, py + CELL / 2, 10, fill === '#ffffff' ? '#f4a261' : '#ffffff');
      }
    });

    // ---- home columns ----
    for (const color of COLORS) {
      const cols = HOME_COL[color];
      cols.forEach(([r, c]) => {
        const px = c * CELL, py = r * CELL;
        x.fillStyle = HEX[color];
        x.strokeStyle = '#ffffff';
        x.lineWidth = 2;
        x.beginPath();
        x.roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 6);
        x.fill();
        x.stroke();
      });
    }

    // ---- center triangles ----
    drawCenter(x);

    bg = c;
    return bg;
  }

  function drawHomeSquare(x, px, py, color) {
    const size = CELL * 6;
    // outer border
    x.fillStyle = HEX[color];
    x.beginPath();
    x.roundRect(px + 4, py + 4, size - 8, size - 8, 18);
    x.fill();

    // inner white
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.roundRect(px + 4 + 40, py + 4 + 40, size - 8 - 80, size - 8 - 80, 12);
    x.fill();

    // 4 base circles
    const baseCenters = BASE_POS[color];
    baseCenters.forEach(([r, c]) => {
      const cx = c * CELL + CELL / 2;
      const cy = r * CELL + CELL / 2;
      x.beginPath();
      x.fillStyle = HEX_LIGHT[color];
      x.arc(cx, cy, 22, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = HEX[color];
      x.lineWidth = 3;
      x.stroke();
    });
  }

  function drawCenter(x) {
    const cx = 300, cy = 300, r = CELL * 1.5;
    // 4 triangles
    const colors = [
      { color: 'red',    x1: cx, y1: cy, x2: cx - r, y2: cy - r, x3: cx + r, y3: cy - r }, // top
      { color: 'green',  x1: cx, y1: cy, x2: cx + r, y2: cy - r, x3: cx + r, y3: cy + r }, // right
      { color: 'yellow', x1: cx, y1: cy, x2: cx + r, y2: cy + r, x3: cx - r, y3: cy + r }, // bottom
      { color: 'blue',   x1: cx, y1: cy, x2: cx - r, y2: cy + r, x3: cx - r, y3: cy - r }  // left
    ];
    colors.forEach(t => {
      x.beginPath();
      x.moveTo(t.x1, t.y1);
      x.lineTo(t.x2, t.y2);
      x.lineTo(t.x3, t.y3);
      x.closePath();
      x.fillStyle = HEX[t.color];
      x.fill();
      x.strokeStyle = '#ffffff';
      x.lineWidth = 3;
      x.stroke();
    });
  }

  function drawStar(x, cx, cy, size, color) {
    x.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (Math.PI / 2) + i * (Math.PI * 2 / 5);
      const a2 = a1 + Math.PI / 5;
      const px1 = cx + Math.cos(a1) * size;
      const py1 = cy + Math.sin(a1) * size;
      const px2 = cx + Math.cos(a2) * size * 0.5;
      const py2 = cy + Math.sin(a2) * size * 0.5;
      if (i === 0) x.moveTo(px1, py1);
      else x.lineTo(px1, py1);
      x.lineTo(px2, py2);
    }
    x.closePath();
    x.fillStyle = color;
    x.fill();
  }

  // ============ TOKEN ============
  function drawToken(ctx, x, y, color, opts = {}) {
    const r = opts.r || 14;
    const { movable = false } = opts;

    // shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.ellipse(x + 2, y + r * 0.9, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 2, x, y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, HEX[color]);
    grad.addColorStop(1, shade(HEX[color], -30));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // inner dot
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();

    // movable glow
    if (movable) {
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r + 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,209,102,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  function shade(hex, pct) {
    const n = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * pct);
    const R = Math.max(0, Math.min(255, (n >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
    const B = Math.max(0, Math.min(255, (n & 0xff) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }

  return { COLORS, HEX, STARTS, SAFE, PATH, posToXY, drawToken, getBG };
})();

window.LudoBoard = LudoBoard;

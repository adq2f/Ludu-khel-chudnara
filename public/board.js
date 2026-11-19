/* =========================================================
   Board geometry + rendering  (15x15 grid, 600x600 canvas)
   ========================================================= */
const LudoBoard = (() => {
  const CELL = 40;
  const SIZE = 600;

  /* The 52-cell main ring, in order */
  const RING = [
    [6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
    [0,7],
    [0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
    [7,0],
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
    [14,7],
    [14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
    [7,14],
    [6,14]
  ];

  const START = { red: 0, green: 13, yellow: 26, blue: 39 };
  const SAFE  = [0, 8, 13, 21, 26, 34, 39, 47];

  /* 5 home-column cells per colour */
  const HOME_PATH = {
    red:    [[7,13],[7,12],[7,11],[7,10],[7,9]],
    green:  [[1,7],[2,7],[3,7],[4,7],[5,7]],
    yellow: [[7,1],[7,2],[7,3],[7,4],[7,5]],
    blue:   [[13,7],[12,7],[11,7],[10,7],[9,7]]
  };

  const BASES = {
    red:    [[75,435],[165,435],[75,525],[165,525]],
    green:  [[75,75],[165,75],[75,165],[165,165]],
    yellow: [[435,75],[525,75],[435,165],[525,165]],
    blue:   [[435,435],[525,435],[435,525],[525,525]]
  };

  const FIN = {
    red:    [300, 332],
    green:  [268, 300],
    yellow: [300, 268],
    blue:   [332, 300]
  };

  const HEX = {
    red:    '#ef4444',
    green:  '#22c55e',
    yellow: '#eab308',
    blue:   '#3b82f6'
  };

  const COLORS = ['red', 'green', 'yellow', 'blue'];

  const cellXY = (c, r) => [c * CELL + CELL / 2, r * CELL + CELL / 2];

  function posToXY(color, p, idx) {
    if (p === -1) {
      const s = BASES[color][idx];
      return { x: s[0], y: s[1] };
    }
    if (p <= 50) {
      const [c, r] = RING[(START[color] + p) % 52];
      const [x, y] = cellXY(c, r);
      return { x, y };
    }
    if (p <= 55) {
      const [c, r] = HOME_PATH[color][p - 51];
      const [x, y] = cellXY(c, r);
      return { x, y };
    }
    const [cx, cy] = FIN[color];
    const off = [[-10,-10],[10,-10],[-10,10],[10,10]][idx];
    return { x: cx + off[0], y: cy + off[1] };
  }

  /* ---------- static background ---------- */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function star(g, cx, cy, outer, inner, pts, color) {
    g.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (Math.PI / pts) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  function drawBaseQuadrant(g, color, ox, oy) {
    g.save();
    roundRect(g, ox + 6, oy + 6, 228, 228, 22);
    g.fillStyle = HEX[color];
    g.fill();
    g.shadowColor = 'rgba(0,0,0,.35)';
    g.shadowBlur = 14;
    g.shadowOffsetY = 5;

    roundRect(g, ox + 26, oy + 26, 188, 188, 16);
    g.fillStyle = 'rgba(255,255,255,.94)';
    g.fill();
    g.restore();

    /* token slots */
    g.save();
    g.strokeStyle = HEX[color];
    g.globalAlpha = .35;
    g.lineWidth = 3;
    BASES[color].forEach(([x, y]) => {
      g.beginPath();
      g.arc(x, y, 20, 0, Math.PI * 2);
      g.stroke();
    });
    g.restore();
  }

  let bgCanvas = null;

  function buildBackground() {
    const cv = document.createElement('canvas');
    cv.width = SIZE; cv.height = SIZE;
    const g = cv.getContext('2d');

    /* outer */
    g.fillStyle = '#0d1324';
    g.fillRect(0, 0, SIZE, SIZE);

    /* white board */
    g.fillStyle = '#f4f7ff';
    roundRect(g, 4, 4, SIZE - 8, SIZE - 8, 22);
    g.fill();

    /* bases */
    drawBaseQuadrant(g, 'green',   0,   0);
    drawBaseQuadrant(g, 'yellow', 360,   0);
    drawBaseQuadrant(g, 'red',     0, 360);
    drawBaseQuadrant(g, 'blue',  360, 360);

    /* ring cells */
    RING.forEach(([c, r], i) => {
      const x = c * CELL, y = r * CELL;

      let fill = '#ffffff';
      const owner = COLORS.find(k => START[k] === i);
      if (owner) fill = HEX[owner];

      g.fillStyle = fill;
      g.fillRect(x, y, CELL, CELL);

      g.strokeStyle = 'rgba(120,140,180,.35)';
      g.lineWidth = 1;
      g.strokeRect(x + .5, y + .5, CELL - 1, CELL - 1);

      if (SAFE.includes(i)) {
        star(g, x + CELL / 2, y + CELL / 2, 12, 5.2, 5,
             owner ? 'rgba(255,255,255,.85)' : 'rgba(150,165,195,.55)');
      }
    });

    /* home columns */
    COLORS.forEach(col => {
      HOME_PATH[col].forEach(([c, r]) => {
        const x = c * CELL, y = r * CELL;
        g.fillStyle = HEX[col];
        g.fillRect(x, y, CELL, CELL);
        g.strokeStyle = 'rgba(255,255,255,.45)';
        g.strokeRect(x + .5, y + .5, CELL - 1, CELL - 1);
      });
    });

    /* centre triangles */
    const cx = 300, cy = 300;
    const tri = (ax, ay, bx, by, col) => {
      g.beginPath();
      g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy);
      g.closePath();
      g.fillStyle = col; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.6)';
      g.lineWidth = 2; g.stroke();
    };
    tri(240, 240, 360, 240, HEX.yellow);
    tri(360, 240, 360, 360, HEX.blue);
    tri(360, 360, 240, 360, HEX.red);
    tri(240, 360, 240, 240, HEX.green);

    /* inner glow ring */
    g.beginPath();
    g.arc(cx, cy, 26, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fill();

    return cv;
  }

  /* ---------- token ---------- */
  function drawToken(g, x, y, color, opts = {}) {
    const r = opts.r || 15;
    const glow = opts.movable ? 1 : 0;

    g.save();

    /* shadow */
    g.beginPath();
    g.ellipse(x, y + r * .72, r * .95, r * .38, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fill();

    /* pulsing ring for movable tokens */
    if (glow) {
      const t = (Date.now() % 1000) / 1000;
      const pr = r + 6 + Math.sin(t * Math.PI * 2) * 3;
      g.beginPath();
      g.arc(x, y, pr, 0, Math.PI * 2);
      g.strokeStyle = `rgba(255,255,255,${0.35 + 0.3 * Math.sin(t * Math.PI * 2)})`;
      g.lineWidth = 3;
      g.stroke();
    }

    /* white outer */
    g.beginPath();
    g.arc(x, y, r + 2.5, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();

    /* body */
    const grad = g.createRadialGradient(x - r * .35, y - r * .45, r * .15, x, y, r);
    grad.addColorStop(0, lighten(HEX[color], .45));
    grad.addColorStop(1, HEX[color]);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();

    /* rim */
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(0,0,0,.18)';
    g.lineWidth = 1.5;
    g.stroke();

    /* highlight */
    g.beginPath();
    g.ellipse(x - r * .3, y - r * .42, r * .34, r * .22, -0.6, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fill();

    g.restore();
  }

  function lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, Math.round(r + (255 - r) * amt));
    g = Math.min(255, Math.round(g + (255 - g) * amt));
    b = Math.min(255, Math.round(b + (255 - b) * amt));
    return `rgb(${r},${g},${b})`;
  }

  function getBG() {
    if (!bgCanvas) bgCanvas = buildBackground();
    return bgCanvas;
  }

  return {
    CELL, SIZE, RING, START, SAFE, HOME_PATH, BASES, HEX, COLORS,
    posToXY, drawToken, getBG, star, roundRect
  };
})();

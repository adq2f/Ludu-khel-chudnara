const LudoBoard = (() => {
  const CELL = 40;
  const COLORS = ['red', 'green', 'yellow', 'blue'];
  const HEX = { red:'#e63946', green:'#2a9d8f', yellow:'#f4a261', blue:'#457b9d' };
  const HEX_LIGHT = { red:'#ffe0e3', green:'#d4f0ec', yellow:'#fdeacf', blue:'#dbe9f4' };

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
  const STARTS = { red:0, green:13, yellow:26, blue:39 };
  const SAFE = [0,8,13,21,26,34,39,47];
  const HOME_COL = {
    red:   [[7,1],[7,2],[7,3],[7,4],[7,5]],
    green: [[1,7],[2,7],[3,7],[4,7],[5,7]],
    yellow:[[7,13],[7,12],[7,11],[7,10],[7,9]],
    blue:  [[13,8],[12,8],[11,8],[10,8],[9,8]]
  };
  const HOME_POS = { red:[7,6], green:[6,7], yellow:[7,8], blue:[8,8] };
  const BASE_POS = {
    red:   [[1,1],[1,3],[3,1],[3,3]],
    green: [[1,11],[1,13],[3,11],[3,13]],
    yellow:[[11,11],[11,13],[13,11],[13,13]],
    blue:  [[11,1],[11,3],[13,1],[13,3]]
  };

  function cellToXY(r,c){ return { x:c*CELL+CELL/2, y:r*CELL+CELL/2 }; }
  function posToXY(color,pos,idx){
    let cell;
    if (pos===-1) cell = BASE_POS[color][idx];
    else if (pos<=50) cell = PATH[(STARTS[color]+pos)%52];
    else if (pos<=55) cell = HOME_COL[color][pos-51];
    else cell = HOME_POS[color];
    return cellToXY(cell[0], cell[1]);
  }

  function roundRect(x,px,py,w,h,r){
    x.beginPath();
    x.moveTo(px+r,py);
    x.arcTo(px+w,py,px+w,py+h,r);
    x.arcTo(px+w,py+h,px,py+h,r);
    x.arcTo(px,py+h,px,py,r);
    x.arcTo(px,py,px+w,py,r);
    x.closePath();
  }

  let bg = null;
  function getBG(){
    if (bg) return bg;
    const c = document.createElement('canvas');
    c.width = 600; c.height = 600;
    const x = c.getContext('2d');

    x.fillStyle = '#ffffff';
    x.fillRect(0,0,600,600);

    drawHome(x, 0, 0, 'red');
    drawHome(x, 9*CELL, 0, 'green');
    drawHome(x, 9*CELL, 9*CELL, 'yellow');
    drawHome(x, 0, 9*CELL, 'blue');

    PATH.forEach(([r,cc],i) => {
      let fill = '#ffffff', stroke = '#d0d6e0';
      for (const col of COLORS) if (i === STARTS[col]) { fill = HEX[col]; stroke = HEX[col]; }
      if (SAFE.includes(i) && !Object.values(STARTS).includes(i)) fill = '#eef1f7';

      const px = cc*CELL, py = r*CELL;
      x.fillStyle = fill; x.strokeStyle = stroke; x.lineWidth = 2;
      roundRect(x, px+1, py+1, CELL-2, CELL-2, 6);
      x.fill(); x.stroke();

      if (SAFE.includes(i) && fill !== HEX.red && fill !== HEX.green &&
          fill !== HEX.yellow && fill !== HEX.blue) {
        drawStar(x, px+CELL/2, py+CELL/2, 9);
      }
    });

    for (const col of COLORS) {
      for (const [r,cc] of HOME_COL[col]) {
        const px = cc*CELL, py = r*CELL;
        x.fillStyle = HEX[col]; x.strokeStyle = '#ffffff'; x.lineWidth = 2;
        roundRect(x, px+1, py+1, CELL-2, CELL-2, 5);
        x.fill(); x.stroke();
      }
    }

    drawCenter(x);
    bg = c;
    return bg;
  }

  function drawHome(x,px,py,col){
    const size = CELL*6;
    x.fillStyle = HEX[col];
    roundRect(x, px+6, py+6, size-12, size-12, 20);
    x.fill();
    x.fillStyle = '#ffffff';
    roundRect(x, px+46, py+46, size-92, size-92, 14);
    x.fill();
    BASE_POS[col].forEach(([r,c]) => {
      const cx = c*CELL+CELL/2, cy = r*CELL+CELL/2;
      x.beginPath();
      x.fillStyle = HEX_LIGHT[col];
      x.arc(cx,cy,22,0,Math.PI*2);
      x.fill();
      x.strokeStyle = HEX[col]; x.lineWidth = 3; x.stroke();
    });
  }

  function drawCenter(x){
    const cx=300, cy=300, r=CELL*1.5;
    const T = [
      { c:'red', a:[cx,cy, cx-r,cy-r, cx+r,cy-r] },
      { c:'green', a:[cx,cy, cx+r,cy-r, cx+r,cy+r] },
      { c:'yellow', a:[cx,cy, cx+r,cy+r, cx-r,cy+r] },
      { c:'blue', a:[cx,cy, cx-r,cy+r, cx-r,cy-r] }
    ];
    T.forEach(t => {
      x.beginPath();
      x.moveTo(t.a[0],t.a[1]); x.lineTo(t.a[2],t.a[3]); x.lineTo(t.a[4],t.a[5]);
      x.closePath();
      x.fillStyle = HEX[t.c]; x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 3; x.stroke();
    });
  }

  function drawStar(x,cx,cy,size){
    x.beginPath();
    for (let i=0;i<5;i++){
      const a1 = -Math.PI/2 + i*Math.PI*2/5;
      const a2 = a1 + Math.PI/5;
      const p1 = [cx+Math.cos(a1)*size, cy+Math.sin(a1)*size];
      const p2 = [cx+Math.cos(a2)*size*0.45, cy+Math.sin(a2)*size*0.45];
      if (i===0) x.moveTo(p1[0],p1[1]); else x.lineTo(p1[0],p1[1]);
      x.lineTo(p2[0],p2[1]);
    }
    x.closePath();
    x.fillStyle = '#f4a261'; x.fill();
  }

  function drawToken(ctx,x,y,col,opts={}){
    const r = opts.r || 14;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.ellipse(x+2, y+r*0.9, r*0.9, r*0.4, 0, 0, Math.PI*2);
    ctx.fill();

    const g = ctx.createRadialGradient(x-r*0.4, y-r*0.4, 2, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, HEX[col]);
    g.addColorStop(1, shade(HEX[col], -40));
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();

    ctx.beginPath();
    ctx.arc(x-r*0.25, y-r*0.25, r*0.25, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();

    if (opts.movable) {
      ctx.beginPath();
      ctx.arc(x,y,r+6,0,Math.PI*2);
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath();
      ctx.arc(x,y,r+10,0,Math.PI*2);
      ctx.strokeStyle = 'rgba(255,209,102,0.4)'; ctx.lineWidth = 3; ctx.stroke();
    }
  }

  function shade(hex,pct){
    const n = parseInt(hex.replace('#',''),16);
    const amt = Math.round(2.55*pct);
    const R = Math.max(0,Math.min(255,(n>>16)+amt));
    const G = Math.max(0,Math.min(255,((n>>8)&0xff)+amt));
    const B = Math.max(0,Math.min(255,(n&0xff)+amt));
    return '#'+(0x1000000+R*0x10000+G*0x100+B).toString(16).slice(1);
  }

  return { COLORS, HEX, STARTS, SAFE, PATH, posToXY, drawToken, getBG };
})();
window.LudoBoard = LudoBoard;

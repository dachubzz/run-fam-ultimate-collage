// Flappy Fam Ultimate — sprites + SFX + PWA + difficulty + local leaderboard + haptics
(function(){
  const $ = (sel) => document.querySelector(sel);
  const menu = $("#menu"), game = $("#game"), post = $("#post");
  const startBtn = $("#startBtn"), againBtn=$("#againBtn"), menuBtn=$("#menuBtn");
  const lastScoreEl=$("#lastScore"), bestScoreEl=$("#bestScore");
  const endScore=$("#endScore"), endBest=$("#endBest"), scoreEl=$("#score");
  const canvas = $("#canvas"), ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const muteChk=$("#muteChk"), muteChkGame=$("#muteChkGame"), hapticsChk=$("#hapticsChk");
  const pauseBtn=$("#pauseBtn"), pauseOverlay=$("#pauseOverlay");
  const resumeBtn=$("#resumeBtn"), restartBtn=$("#restartBtn"), toMenuBtn=$("#toMenuBtn");
  const diffSel=$("#diff"); const boardEl=$("#board");
  const installBtn=$("#installBtn"); const shareUrl=$("#shareUrl");
  let raf, running=false, paused=false, deferredPrompt=null;

  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt = e; installBtn.hidden = false; });
  installBtn.addEventListener('click', async ()=>{ if (!deferredPrompt) return; deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome) installBtn.hidden = true; });

  const SPRITES = {
    chicken: img("characters/chicken.png"),
    frog: img("characters/frog.png"),
    cat: img("characters/cat.png"),
    duck: img("characters/duck.png"),
    pig: img("characters/pig.png"),
  };
  function img(src){ const i=new Image(); i.src=src; return i; }

  const SFX = {
    boom: new Audio("assets/sfx/boom.wav"),
    quack: new Audio("assets/sfx/quack.wav"),
    oink: new Audio("assets/sfx/oink.wav"),
    ribbit: new Audio("assets/sfx/ribbit.wav"),
    bruh: new Audio("assets/sfx/bruh.wav"),
    point: new Audio("assets/sfx/point.wav"),
    flap: new Audio("assets/sfx/flap.wav"),
  };
  Object.values(SFX).forEach(a=>{ a.preload="auto"; a.volume=0.9; });

  let best = +localStorage.getItem("flappyfam_best") || 0;
  let last = +localStorage.getItem("flappyfam_last") || 0;
  let board = JSON.parse(localStorage.getItem("flappyfam_board") || "[]");
  function saveBoard(){ localStorage.setItem("flappyfam_board", JSON.stringify(board)); }
  bestScoreEl.textContent = best; lastScoreEl.textContent = last;
  function renderBoard(){
    boardEl.innerHTML = "";
    board.slice(0,10).forEach((row)=>{
      const li = document.createElement("li");
      const d = new Date(row.date).toLocaleDateString();
      li.textContent = `${row.score} — ${row.char} — ${d}`;
      boardEl.appendChild(li);
    });
  }

  const CHAR = {
    chicken: { name:"Chick’n Nuggy", bg:(t)=>bgKitchen(t), obstacle:(p,t)=>obsFryerBasket(p,t), death:()=>sfx("boom"),   draw:(x,y,phase)=>sprite(SPRITES.chicken,x,y,phase,true) },
    frog:    { name:"Lil’ Ribbz",    bg:(t)=>bgNeonSwamp(t), obstacle:(p,t)=>obsLilypad(p,t),     death:()=>sfx("ribbit"), draw:(x,y,phase)=>sprite(SPRITES.frog,x,y,phase,false) },
    cat:     { name:"Zoomie",        bg:(t)=>bgCyberApt(t),  obstacle:(p,t)=>obsLasers(p,t),      death:()=>sfx("bruh"),   draw:(x,y,phase)=>sprite(SPRITES.cat,x,y,phase,false) },
    duck:    { name:"Quackhead",     bg:(t)=>bgFoodCourt(t), obstacle:(p,t)=>obsBurger(p,t),      death:()=>sfx("quack"),  draw:(x,y,phase)=>sprite(SPRITES.duck,x,y,phase,true) },
    pig:     { name:"Snaccident",    bg:(t)=>bgFridge(t),    obstacle:(p,t)=>obsSnack(p,t),       death:()=>sfx("oink"),   draw:(x,y,phase)=>sprite(SPRITES.pig,x,y,phase,false) },
  };

  const charButtons = Array.from(document.querySelectorAll(".char"));
  let selectedId = null;
  charButtons.forEach(btn=>{
    const id = btn.dataset.id;
    const c = btn.querySelector("canvas");
    const cctx = c.getContext("2d");
    (function preview(){
      cctx.clearRect(0,0,c.width,c.height);
      cctx.save(); cctx.translate(c.width/2, c.height/2+6);
      sprite(SPRITES[id], 0,0, (Date.now()/300)%1, true, cctx, 0.8);
      cctx.restore();
      requestAnimationFrame(preview);
    })();
    btn.addEventListener("click", ()=>{
      charButtons.forEach(b=>b.removeAttribute("aria-selected"));
      btn.setAttribute("aria-selected","true");
      selectedId = id;
      startBtn.disabled = false;
    });
  });

  startBtn.addEventListener("click", ()=>startGame());
  againBtn.addEventListener("click", ()=>startGame());
  menuBtn.addEventListener("click", ()=>show(menu));
  pauseBtn.addEventListener("click", ()=> togglePause(true));
  resumeBtn.addEventListener("click", ()=> togglePause(false));
  restartBtn.addEventListener("click", ()=>{ togglePause(false); startGame(); });
  toMenuBtn.addEventListener("click", ()=>{ togglePause(false); show(menu); });

  function togglePause(state){ if (!running) return; paused = state; $("#pauseOverlay").classList.toggle("show", paused); if (!paused) loop(); }
  function applyMute(){ const m = muteChk.checked || (muteChkGame && muteChkGame.checked); Object.values(SFX).forEach(a=>a.muted=m); }
  muteChk.addEventListener("change", applyMute); if (muteChkGame) muteChkGame.addEventListener("change", applyMute);
  function show(el){ [menu, game, post].forEach(s=>s.classList.remove("active")); el.classList.add("active"); if (el===post) renderBoard(); }

  let player, pipes, score, speed, grav, gap, time, theme;
  const groundH = 70, groundY = H - groundH, pipeW = 62;

  function startGame(){
    if (!selectedId) return;
    cancelAnimationFrame(raf); show(game);
    theme = CHAR[selectedId];
    const d = $("#diff").value;
    if (d==="easy"){ speed = 2.2; grav = 0.40; gap = 140; }
    else if (d==="hard"){ speed = 2.8; grav = 0.45; gap = 115; }
    else { speed = 2.4; grav = 0.42; gap = 130; }
    score = 0; time = 0; player = {x: W*0.3, y:H*0.45, vy:0, r:14};
    pipes = []; for (let i=0;i<3;i++) spawnPipe(W + i*160);
    scoreEl.textContent = "0"; running=true; paused=false; $("#pauseOverlay").classList.remove("show");
    loop();
  }

  function endGame(){
    running = false;
    last = score; best = Math.max(best, score);
    localStorage.setItem("flappyfam_last", last); localStorage.setItem("flappyfam_best", best);
    board.push({score, char: CHAR[selectedId].name, date: Date.now()});
    board.sort((a,b)=>b.score-a.score); board = board.slice(0,50); saveBoard();
    $("#shareUrl").value = location.href + "?score=" + last + "&char=" + encodeURIComponent(CHAR[selectedId].name);
    endScore.textContent = last; endBest.textContent = best; show(post);
  }

  function flap(){ if (running && !paused){ player.vy = -7.8; sfx('flap'); haptic(10); } }
  document.addEventListener("keydown", (e)=>{
    if (e.code==="Space"||e.code==="ArrowUp"){ e.preventDefault(); if (paused){ togglePause(false); } else flap(); }
    if (e.code==="Escape"){ e.preventDefault(); if (running) togglePause(!paused); }
  }, {passive:false});
  canvas.addEventListener("pointerdown", ()=>{ if (paused) togglePause(false); else flap(); });

  function spawnPipe(x){
    const margin = 20;
    const g = Math.max(90, gap + Math.sin(time/240)*8);
    const topH = rand(margin, H - groundH - g - margin);
    pipes.push({x, topH, gap:g, passed:false});
  }

  function update(){
    if (paused) return;
    time++; if (time % 480 === 0){ speed = Math.min(5, speed + 0.2); gap = Math.max(95, gap - 4); }
    player.vy += grav; player.y += player.vy;
    for (let i=pipes.length-1;i>=0;i--){
      const p = pipes[i]; p.x -= speed;
      if (!p.passed && p.x + pipeW < player.x - player.r){ p.passed = true; score++; scoreEl.textContent = String(score); sfx('point'); }
      if (p.x + pipeW < -10){ pipes.splice(i,1); spawnPipe(W + rand(80,120)); }
    }
    if (player.y + player.r > groundY || player.y - player.r < 0){ theme.death(); haptic(30); return endGame(); }
    for (const p of pipes){
      const withinX = player.x + player.r > p.x && player.x - player.r < p.x + pipeW;
      if (withinX){
        const topH = p.topH, bottomY = p.topH + p.gap;
        if (player.y - player.r < topH || player.y + player.r > bottomY){ theme.death(); haptic(30); return endGame(); }
      }
    }
  }

  function render(){
    theme.bg(time);
    for (const p of pipes){ theme.obstacle(p, time); }
    ground();
    ctx.save(); ctx.translate(player.x, player.y);
    const phase = (time/8)%1; const angle = Math.max(-0.6, Math.min(0.8, player.vy*0.06));
    ctx.rotate(angle); CHAR[selectedId].draw(0,0,phase); ctx.restore();
  }

  function loop(){ update(); ctx.clearRect(0,0,W,H); render(); if (running) raf = requestAnimationFrame(loop); }

  function bgKitchen(t){ ctx.fillStyle = "#9be1ff"; ctx.fillRect(0,0,W,H); clouds(t); ctx.fillStyle = "#333"; ctx.fillRect(0, H-92, W, 6); }
  function bgNeonSwamp(t){ grad("#03121a","#09334a"); glow(t, 40, "#00ffaa"); clouds(t, .8); }
  function bgCyberApt(t){ grad("#0a0a12","#17192b"); blocks(t); }
  function bgFoodCourt(t){ grad("#14202b","#24465a"); bokeh(t); }
  function bgFridge(t){ grad("#0b1a24","#0c2e44"); stars(t); }
  function ground(){ ctx.fillStyle = "#7db343"; ctx.fillRect(0, H-70, W, 70); ctx.strokeStyle="#d7ccc8"; ctx.lineWidth=3; ctx.beginPath(); for (let x=0; x<W; x+=22){ ctx.moveTo(x, H-52); ctx.lineTo(x, H-68); } ctx.moveTo(0, H-60); ctx.lineTo(W, H-60); ctx.stroke(); }
  function obsFryerBasket(p,t){ const y=Math.sin((t+p.x)*0.05)*4; pipesDraw(p.x, p.topH+y, p.gap, "#5aa469", "#3e7e4e"); oil(p.x+31, p.topH-12 + (t%40), 6); oil(p.x+31, p.topH+p.gap+12 - (t%40), 6); }
  function obsLilypad(p,t){ const y=Math.sin((t+p.x)*0.07)*6; pipesDraw(p.x, p.topH+y, p.gap, "#2db36e", "#1e7c4b"); lily(p.x+31, p.topH-18 + Math.sin(t*0.2)*3); lily(p.x+31, p.topH+p.gap+18 + Math.cos(t*0.2)*3); }
  function obsLasers(p,t){ const y=Math.sin((t+p.x)*0.09)*5; pipesDraw(p.x, p.topH+y, p.gap, "#8a2be2", "#5c1c96"); laser(p.x+31, p.topH-12, t); laser(p.x+31, p.topH+p.gap+12, t); }
  function obsBurger(p,t){ const y=Math.sin((t+p.x)*0.05)*4; pipesDraw(p.x, p.topH+y, p.gap, "#d4984a", "#9c6b2f"); burger(p.x+31, p.topH-16 + Math.sin(t*0.2)*4); burger(p.x+31, p.topH+p.gap+16 + Math.cos(t*0.2)*4); }
  function obsSnack(p,t){ const y=Math.sin((t+p.x)*0.06)*5; pipesDraw(p.x, p.topH+y, p.gap, "#4aa0d4", "#2a6f96"); donut(p.x+31, p.topH-16, t); donut(p.x+31, p.topH+p.gap+16, -t); }
  function pipesDraw(x, topH, gap, main, lip){ ctx.fillStyle = main; ctx.fillRect(x, 0, 62, topH); ctx.fillRect(x, topH+gap, 62, H-70 - (topH+gap)); ctx.fillStyle = lip; ctx.fillRect(x-3, topH-12, 68, 12); ctx.fillRect(x-3, topH+gap, 68, 12); }
  function oil(x,y,r){ ctx.fillStyle="rgba(20,20,20,0.6)"; ctx.beginPath(); ctx.ellipse(x,y, r, r*0.7, 0, 0, Math.PI*2); ctx.fill(); }
  function lily(x,y){ ctx.fillStyle="#47e08d"; ctx.beginPath(); ctx.ellipse(x,y, 12, 8, 0, 0, Math.PI*2); ctx.fill(); ctx.fillStyle="#2aa86b"; ctx.beginPath(); ctx.ellipse(x+6,y, 6, 4, 0, 0, Math.PI*2); ctx.fill(); }
  function laser(x,y,t){ ctx.save(); ctx.globalAlpha = 0.7 + Math.sin(t*0.4)*0.2; ctx.fillStyle="#ff2bd6"; ctx.fillRect(x-18, y-3, 36, 6); ctx.restore(); }
  function burger(x,y){ ctx.fillStyle="#8b4513"; ctx.fillRect(x-14,y-6,28,12); ctx.fillStyle="#d2b48c"; ctx.fillRect(x-16,y-12,32,8); ctx.fillStyle="#deb887"; ctx.fillRect(x-16,y+6,32,8); ctx.fillStyle="#b22222"; ctx.fillRect(x-14,y-2,28,4); ctx.fillStyle="#2e8b57"; ctx.fillRect(x-14,y+2,28,3); }
  function donut(x,y,t){ ctx.save(); ctx.translate(x,y); ctx.rotate((t%360)/20); ctx.fillStyle="#ff69b4"; ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill(); ctx.globalCompositeOperation="destination-out"; ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.fill(); ctx.globalCompositeOperation="source-over"; ctx.fillStyle="#fff"; for (let i=0;i<6;i++){ ctx.fillRect(-1, -10+i*3, 2, 2); } ctx.restore(); }

  function sprite(img, x, y, phase, wingy=false, useCtx=ctx, scale=1.0){
    if (!img.complete) return;
    const w = img.width, h = img.height;
    const maxDim = 42*scale; const ratio = Math.min(maxDim / h, maxDim / w);
    const dw = w * ratio, dh = h * ratio;
    useCtx.save(); useCtx.translate(x, y + Math.sin(phase*Math.PI*2)*(wingy?2.5:1.5)); useCtx.drawImage(img, -dw/2, -dh/2, dw, dh); useCtx.restore();
  }

  function sfx(name){ const a=SFX[name]; if (!a) return; a.currentTime=0; if (muteChk.checked || (muteChkGame && muteChkGame.checked)) return; a.play().catch(()=>{}); }
  function haptic(ms){ try{ if (hapticsChk.checked && "vibrate" in navigator){ navigator.vibrate(ms); } }catch(e){} }

  function grad(a,b){ const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,a); g.addColorStop(1,b); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); }
  function clouds(t, speed=1){ ctx.fillStyle="rgba(255,255,255,.9)"; for (let i=0;i<6;i++){ const x = ((W + (i*70) - (t*0.6*speed)) % (W+140)) - 70; const y = (i*37)% (H-130); ctx.beginPath(); ctx.arc(x,y,14,0,Math.PI*2); ctx.arc(x+12,y+2,12,0,Math.PI*2); ctx.arc(x+24,y-1,13,0,Math.PI*2); ctx.fill(); } }
  function glow(t, y, col){ ctx.save(); ctx.fillStyle=col; ctx.globalAlpha=0.2 + 0.1*Math.sin(t*0.2); ctx.fillRect(0, y + Math.sin(t*0.1)*10, W, 10); ctx.restore(); }
  function blocks(t){ ctx.fillStyle="#20263a"; for (let i=0;i<8;i++){ const x = ((i*60) - (t*0.5)) % (W+60); ctx.fillRect(x, 80+(i%3)*30, 50, 30); } }
  function bokeh(t){ for (let i=0;i<12;i++){ const x=((i*40)-(t*0.6))%(W+40); const y=(i*34)%H; ctx.fillStyle=`rgba(255,255,255,${0.12 + (i%3)*0.04})`; ctx.beginPath(); ctx.arc(x,y,8+(i%4),0,Math.PI*2); ctx.fill(); } }
  function stars(t){ ctx.fillStyle="rgba(255,255,255,.8)"; for (let i=0;i<18;i++){ const x=((i*20)-(t*0.4))%(W+20); const y=(i*23)%H; ctx.fillRect(x,y,2,2); } }

  function rand(min,max){ return Math.random()*(max-min)+min; }
  show(menu);
})();
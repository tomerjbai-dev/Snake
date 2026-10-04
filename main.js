(() => {
  'use strict';

  // ---------- Config ----------

  const GRID_SIZE = 20;          // cells per row / column
  const START_INTERVAL = 150;    // ms per step at the beginning
  const MIN_INTERVAL = 60;       // fastest the snake can get
  const SPEED_STEP = 3;          // ms shaved off per food eaten
  const SWIPE_THRESHOLD = 24;    // px before a touch counts as a swipe

  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const KEY_MAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  // ---------- DOM ----------

  const board = document.getElementById('board');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const startButton = document.getElementById('start-button');

  // Colors live in styles.css; read them so the canvas matches the theme.
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const COLORS = {
    grid: color('--grid-line'),
    head: color('--snake-head'),
    body: color('--snake-body'),
    eye: color('--snake-eye'),
    food: color('--food'),
  };

  // ---------- State ----------

  let snake = [];
  let direction = DIRECTIONS.right;
  let inputQueue = [];
  let food = null;
  let score = 0;
  let interval = START_INTERVAL;
  let running = false;
  let lastStepTime = 0;
  let cell = 0; // size of one grid cell in canvas pixels

  // ---------- Sound (Web Audio, no files) ----------

  let audioCtx = null;

  function initAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function beep(fromFreq, toFreq, duration, type = 'square', volume = 0.08) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, now);
    osc.frequency.exponentialRampToValueAtTime(toFreq, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  const playEat = () => beep(520, 1040, 0.1);
  const playStart = () => beep(330, 660, 0.18, 'triangle', 0.1);
  const playGameOver = () => beep(320, 60, 0.6, 'sawtooth', 0.1);

  // ---------- Game logic ----------

  function resetGame() {
    const mid = Math.floor(GRID_SIZE / 2);
    snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    direction = DIRECTIONS.right;
    inputQueue = [];
    score = 0;
    interval = START_INTERVAL;
    scoreEl.textContent = '0';
    placeFood();
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function start() {
    if (running) return;
    initAudio();
    resetGame();
    running = true;
    lastStepTime = performance.now();
    overlay.classList.add('hidden');
    board.classList.remove('shake');
    startButton.blur();
    playStart();
  }

  function gameOver(won = false) {
    running = false;
    overlayTitle.textContent = won ? 'You Win!' : 'Game Over';
    overlayTitle.classList.toggle('game-over', !won);
    overlayText.textContent = `Score: ${score}`;
    overlay.classList.remove('hidden');
    if (!won) {
      playGameOver();
      board.classList.remove('shake');
      void board.offsetWidth; // restart the animation
      board.classList.add('shake');
    }
  }

  function queueDirection(name) {
    if (!running) return;
    const next = DIRECTIONS[name];
    const last = inputQueue.length ? inputQueue[inputQueue.length - 1] : direction;
    // Ignore repeats and 180° turns.
    if (next.x === last.x && next.y === last.y) return;
    if (next.x === -last.x && next.y === -last.y) return;
    if (inputQueue.length < 2) inputQueue.push(next);
  }

  function step() {
    if (inputQueue.length) direction = inputQueue.shift();

    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    const eating = food && head.x === food.x && head.y === food.y;

    const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID_SIZE || head.y >= GRID_SIZE;
    // The tail moves away this step unless we're growing, so it isn't an obstacle.
    const obstacles = eating ? snake : snake.slice(0, -1);
    const hitSelf = obstacles.some((s) => s.x === head.x && s.y === head.y);

    if (hitWall || hitSelf) {
      gameOver();
      return;
    }

    snake.unshift(head);

    if (eating) {
      score++;
      scoreEl.textContent = String(score);
      scoreEl.classList.remove('bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('bump');
      interval = Math.max(MIN_INTERVAL, interval - SPEED_STEP);
      playEat();
      placeFood();
      if (!food) gameOver(true); // board is full
    } else {
      snake.pop();
    }
  }

  // ---------- Rendering ----------

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(board.clientWidth * dpr);
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    cell = canvas.width / GRID_SIZE;
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  function drawGrid() {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < GRID_SIZE; i++) {
      const p = Math.round(i * cell) + 0.5;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, canvas.height);
      ctx.moveTo(0, p);
      ctx.lineTo(canvas.width, p);
    }
    ctx.stroke();
  }

  function drawFood(time) {
    if (!food) return;
    const pulse = 0.85 + 0.15 * Math.sin(time / 180);
    const cx = (food.x + 0.5) * cell;
    const cy = (food.y + 0.5) * cell;
    ctx.save();
    ctx.fillStyle = COLORS.food;
    ctx.shadowColor = COLORS.food;
    ctx.shadowBlur = cell * 0.9 * pulse;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.32 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake() {
    const pad = cell * 0.08;
    const size = cell - pad * 2;

    ctx.save();
    // Draw tail first so the head sits on top.
    for (let i = snake.length - 1; i >= 0; i--) {
      const seg = snake[i];
      const isHead = i === 0;
      const fill = isHead ? COLORS.head : COLORS.body;
      ctx.globalAlpha = isHead ? 1 : Math.max(0.4, 1 - (i / snake.length) * 0.6);
      ctx.fillStyle = fill;
      ctx.shadowColor = fill;
      ctx.shadowBlur = cell * (isHead ? 0.8 : 0.45);
      roundedRect(seg.x * cell + pad, seg.y * cell + pad, size, size, cell * 0.28);
      ctx.fill();
    }
    ctx.restore();

    drawEyes();
  }

  function drawEyes() {
    const head = snake[0];
    if (!head) return;
    const cx = (head.x + 0.5) * cell;
    const cy = (head.y + 0.5) * cell;
    const forward = cell * 0.16;
    const side = cell * 0.18;
    ctx.fillStyle = COLORS.eye;
    for (const sign of [-1, 1]) {
      const ex = cx + direction.x * forward - direction.y * side * sign;
      const ey = cy + direction.y * forward + direction.x * side * sign;
      ctx.beginPath();
      ctx.arc(ex, ey, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawFood(time);
    drawSnake();
  }

  function loop(time) {
    if (running && time - lastStepTime >= interval) {
      lastStepTime = time;
      step();
    }
    draw(time);
    requestAnimationFrame(loop);
  }

  // ---------- Input ----------

  document.addEventListener('keydown', (e) => {
    const name = KEY_MAP[e.code];
    if (name) {
      e.preventDefault();
      queueDirection(name);
      return;
    }
    if (!running && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      start();
    }
  });

  startButton.addEventListener('click', start);

  let touchStart = null;

  board.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  board.addEventListener('touchmove', (e) => {
    if (!touchStart) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      queueDirection(dx > 0 ? 'right' : 'left');
    } else {
      queueDirection(dy > 0 ? 'down' : 'up');
    }
    // Re-anchor so one continuous drag can chain several turns.
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  board.addEventListener('touchend', () => {
    touchStart = null;
  });

  window.addEventListener('resize', resizeCanvas);

  // ---------- Boot ----------

  resizeCanvas();
  resetGame();
  requestAnimationFrame(loop);
})();

const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreList = document.getElementById('scoreList');
const highScoreValue = document.getElementById('highScoreValue');
const localIpValue = document.getElementById('localIpValue');
const localPortValue = document.getElementById('localPortValue');
const localUrlValue = document.getElementById('localUrlValue');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const nameForm = document.getElementById('nameForm');
const playerNameInput = document.getElementById('playerNameInput');
const muteBtn = document.getElementById('muteBtn');
const jumpBtn = document.getElementById('jumpBtn');
const duckBtn = document.getElementById('duckBtn');
const connectionStatus = document.getElementById('connectionStatus');

let myId = null;
let localNetworkUrl = '';
let config = {
    width: 900,
    height: 300,
    groundY: 248,
    dinoWidth: 44,
    dinoHeight: 48,
    dinoDuckWidth: 58,
    dinoDuckHeight: 28
};

let currentState = {
    status: 'waiting',
    speed: 6.5,
    baseSpeed: 6.5,
    score: 0,
    highScore: 0,
    groundOffset: 0,
    isNight: false,
    tick: 0,
    lastWinner: null,
    obstacles: [],
    players: {}
};

// Controle local de áudio retrô via Web Audio API
let audioCtx = null;
let isMuted = false;
let prevAlive = true;
let prevJumping = false;
let lastMilestone = 0;
let flashUntil = 0;
let isDuckPressed = false;
let nightBlend = 0; // Transição suave entre dia (0) e noite (1)

// Elementos decorativos locais (nuvens, estrelas e pedrinhas do chão)
const clouds = [
    { x: 160, y: 58, scale: 1 },
    { x: 430, y: 38, scale: 0.85 },
    { x: 740, y: 72, scale: 1.1 }
];

const stars = [
    { x: 110, y: 42, size: 3 },
    { x: 260, y: 28, size: 2 },
    { x: 390, y: 66, size: 3 },
    { x: 540, y: 34, size: 2 },
    { x: 690, y: 52, size: 3 },
    { x: 820, y: 26, size: 2 }
];

const groundBumps = Array.from({ length: 34 }, (_, i) => ({
    offset: (i * 29 + (i % 3) * 11) % 900,
    width: 2 + (i % 5) * 2,
    yOffset: 6 + (i % 4) * 5
}));

function ensureAudioContext() {
    if (isMuted) return null;
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playTone(freqStart, freqEnd, duration, type = 'square', volume = 0.06) {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start(now);
    osc.stop(now + duration);
}

function playJumpSound() {
    playTone(280, 560, 0.09, 'square', 0.05);
}

function playMilestoneSound() {
    playTone(988, 988, 0.08, 'square', 0.05);
    setTimeout(() => playTone(1318, 1318, 0.16, 'square', 0.05), 85);
}

function playHitSound() {
    playTone(210, 75, 0.22, 'sawtooth', 0.07);
}

function formatScore(value) {
    return String(Math.max(0, Math.floor(value))).padStart(5, '0');
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpColor(rgbA, rgbB, t) {
    const r = Math.round(lerp(rgbA[0], rgbB[0], t));
    const g = Math.round(lerp(rgbA[1], rgbB[1], t));
    const b = Math.round(lerp(rgbA[2], rgbB[2], t));
    return `rgb(${r}, ${g}, ${b})`;
}

// Eventos de conexão
socket.on('connect', () => {
    myId = socket.id;
    connectionStatus.textContent = 'Online';
    connectionStatus.className = 'status-pill online';
});

socket.on('disconnect', () => {
    connectionStatus.textContent = 'Desconectado';
    connectionStatus.className = 'status-pill offline';
});

function updateNetworkInfo(network) {
    if (!network || !network.ip) return;
    const port = network.port || 3000;
    localIpValue.textContent = `${network.ip}:${port}`;
    localPortValue.textContent = `Porta: ${port}`;
    localNetworkUrl = network.url || `http://${network.ip}:${port}`;
    localUrlValue.textContent = localNetworkUrl;
}

fetch('/api/network')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => updateNetworkInfo(data))
    .catch(() => { });

copyUrlBtn.addEventListener('click', () => {
    const textToCopy = localNetworkUrl || localIpValue.textContent;
    if (!textToCopy || textToCopy === 'Detectando...') return;

    const showCopied = () => {
        copyUrlBtn.textContent = 'Copiado!';
        setTimeout(() => {
            copyUrlBtn.textContent = 'Copiar';
        }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(showCopied).catch(() => { });
    } else {
        const tempInput = document.createElement('textarea');
        tempInput.value = textToCopy;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        showCopied();
    }
});

socket.on('init', (payload) => {
    myId = payload.id;
    if (payload.network) {
        updateNetworkInfo(payload.network);
    }
    if (payload.config) {
        config = payload.config;
        canvas.width = config.width;
        canvas.height = config.height;
    }
});

socket.on('stateUpdate', (state) => {
    const me = myId ? state.players[myId] : null;

    if (me) {
        // Som de pulo
        if (me.isJumping && !prevJumping && state.status === 'running') {
            playJumpSound();
        }
        // Som de colisão
        if (!me.alive && prevAlive && state.status !== 'waiting') {
            playHitSound();
        }
        // Marco de 100 pontos
        const currentMilestone = Math.floor(me.score / 100);
        if (currentMilestone > lastMilestone && me.score >= 100 && me.alive) {
            lastMilestone = currentMilestone;
            flashUntil = performance.now() + 900;
            playMilestoneSound();
        } else if (me.score < 100) {
            lastMilestone = 0;
        }

        prevAlive = me.alive;
        prevJumping = me.isJumping;
    }

    currentState = state;
    highScoreValue.textContent = formatScore(state.highScore || 0);
    updateScoreboard(state.players);
});

// Ações do jogador
function sendJump() {
    ensureAudioContext();
    socket.emit('playerAction', { type: 'jump' });
}

function setDuck(active) {
    if (isDuckPressed === active) return;
    isDuckPressed = active;
    socket.emit('playerAction', { type: active ? 'duckStart' : 'duckEnd' });
}

// Teclado
document.addEventListener('keydown', (event) => {
    if (document.activeElement === playerNameInput) return;

    if (event.code === 'Space' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        event.preventDefault();
        if (event.repeat && currentState.status !== 'running') return;
        sendJump();
    } else if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        event.preventDefault();
        setDuck(true);
    } else if ((event.key === 'r' || event.key === 'R') && currentState.status === 'gameover') {
        event.preventDefault();
        socket.emit('playerAction', { type: 'restart' });
    }
});

document.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        setDuck(false);
    }
});

window.addEventListener('blur', () => {
    setDuck(false);
});

// Clique / toque no canvas e botões
canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    sendJump();
});

jumpBtn.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    sendJump();
});

duckBtn.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    setDuck(true);
});

duckBtn.addEventListener('pointerup', () => setDuck(false));
duckBtn.addEventListener('pointerleave', () => setDuck(false));
duckBtn.addEventListener('pointercancel', () => setDuck(false));

muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔇 Mudo' : '🔊 Som';
});

nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = playerNameInput.value.trim();
    if (name) {
        socket.emit('setName', { name });
        playerNameInput.blur();
    }
});

// Placar lateral seguro contra XSS
function updateScoreboard(players) {
    scoreList.innerHTML = '';

    const sortedPlayers = Object.values(players).sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        return b.bestScore - a.bestScore;
    });

    sortedPlayers.forEach((player) => {
        const li = document.createElement('li');
        if (player.id === myId) li.classList.add('is-me');
        if (!player.alive && currentState.status !== 'waiting') li.classList.add('eliminated');

        const info = document.createElement('div');
        info.className = 'player-info';

        const badge = document.createElement('span');
        badge.className = 'player-badge';

        const dot = document.createElement('span');
        dot.className = 'color-dot';
        dot.style.backgroundColor = player.color;

        const nameText = document.createElement('span');
        nameText.textContent = player.id === myId ? `${player.name} (Você)` : player.name;

        badge.appendChild(dot);
        badge.appendChild(nameText);

        const meta = document.createElement('span');
        meta.className = 'player-meta';
        const statusLabel = currentState.status === 'waiting'
            ? 'Pronto'
            : player.alive
                ? 'Correndo'
                : 'Eliminado';
        const winsText = player.wins > 0 ? ` • ${player.wins}V` : '';
        meta.textContent = `${statusLabel} • Rec: ${formatScore(player.bestScore)}${winsText}`;

        info.appendChild(badge);
        info.appendChild(meta);

        const scoreEl = document.createElement('strong');
        scoreEl.className = 'player-score';
        scoreEl.textContent = formatScore(player.score);

        li.appendChild(info);
        li.appendChild(scoreEl);
        scoreList.appendChild(li);
    });
}

// --- Desenho em Pixel Art no Canvas ---

function drawCloud(x, y, scale, color) {
    ctx.fillStyle = color;
    const s = 4 * scale;
    ctx.fillRect(x, y, 10 * s, 3 * s);
    ctx.fillRect(x + 2 * s, y - 2 * s, 6 * s, 2 * s);
    ctx.fillRect(x + 4 * s, y - 3 * s, 3 * s, s);
    ctx.fillRect(x - 2 * s, y + s, 14 * s, 2 * s);
}

function drawMoon(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 6, y, 10, 4);
    ctx.fillRect(x + 2, y + 4, 10, 4);
    ctx.fillRect(x, y + 8, 8, 10);
    ctx.fillRect(x + 2, y + 18, 10, 4);
    ctx.fillRect(x + 6, y + 22, 10, 4);
}

function drawCactus(obs, color) {
    ctx.fillStyle = color;
    const { x, y, width, height, type } = obs;

    if (type === 'cactus_small') {
        const trunkX = x + 7;
        ctx.fillRect(trunkX, y, 8, height);
        ctx.fillRect(trunkX + 2, y - 2, 4, 2);
        // Braço esquerdo
        ctx.fillRect(x, y + 10, 5, 12);
        ctx.fillRect(x + 2, y + 18, 7, 5);
        // Braço direito
        ctx.fillRect(x + width - 5, y + 14, 5, 12);
        ctx.fillRect(x + width - 9, y + 22, 7, 5);
    } else if (type === 'cactus_large') {
        const trunkX = x + 9;
        ctx.fillRect(trunkX, y, 10, height);
        ctx.fillRect(trunkX + 2, y - 2, 6, 2);
        // Braço esquerdo
        ctx.fillRect(x, y + 12, 6, 16);
        ctx.fillRect(x + 2, y + 24, 9, 6);
        // Braço direito
        ctx.fillRect(x + width - 6, y + 18, 6, 15);
        ctx.fillRect(x + width - 11, y + 29, 9, 6);
    } else {
        // Grupo de 3 cactos compactos
        drawCactus({ x, y: y + 8, width: 18, height: height - 8, type: 'cactus_small' }, color);
        drawCactus({ x: x + 16, y, width: 22, height, type: 'cactus_small' }, color);
        drawCactus({ x: x + 36, y: y + 10, width: 18, height: height - 10, type: 'cactus_small' }, color);
    }
}

function drawPtero(obs, color, tick) {
    ctx.fillStyle = color;
    const { x, y } = obs;
    const wingUp = Math.floor(tick / 9) % 2 === 0;

    // Cabeça e bico
    ctx.fillRect(x, y + 10, 12, 4);
    ctx.fillRect(x + 6, y + 6, 10, 6);
    ctx.fillRect(x + 12, y + 4, 6, 4);

    // Corpo e cauda
    ctx.fillRect(x + 14, y + 10, 20, 10);
    ctx.fillRect(x + 34, y + 13, 8, 5);
    ctx.fillRect(x + 42, y + 15, 4, 3);

    // Asas animadas
    if (wingUp) {
        ctx.fillRect(x + 16, y - 4, 6, 14);
        ctx.fillRect(x + 22, y + 2, 6, 8);
    } else {
        ctx.fillRect(x + 16, y + 20, 6, 12);
        ctx.fillRect(x + 22, y + 20, 6, 7);
    }
}

function drawStandingDino(player, tick, outlineColor, eyeColor) {
    const { x, y, color, isJumping, alive } = player;
    const step = Math.floor(tick / 6) % 2;

    ctx.fillStyle = color;
    // Cabeça e focinho
    ctx.fillRect(x + 20, y, 22, 16);
    ctx.fillRect(x + 22, y - 2, 18, 2);
    ctx.fillRect(x + 26, y + 16, 14, 4);

    // Pescoço e tronco
    ctx.fillRect(x + 16, y + 14, 14, 10);
    ctx.fillRect(x + 10, y + 20, 20, 16);
    ctx.fillRect(x + 14, y + 34, 14, 4);

    // Cauda
    ctx.fillRect(x, y + 20, 6, 10);
    ctx.fillRect(x + 4, y + 24, 8, 10);

    // Braço
    ctx.fillRect(x + 30, y + 24, 7, 4);
    ctx.fillRect(x + 34, y + 26, 3, 5);

    // Pernas (alternam durante a corrida)
    if (isJumping || !alive || currentState.status === 'waiting') {
        ctx.fillRect(x + 13, y + 38, 6, 10);
        ctx.fillRect(x + 13, y + 45, 9, 3);
        ctx.fillRect(x + 23, y + 38, 6, 10);
        ctx.fillRect(x + 23, y + 45, 9, 3);
    } else if (step === 0) {
        ctx.fillRect(x + 13, y + 38, 6, 10);
        ctx.fillRect(x + 13, y + 45, 9, 3);
        ctx.fillRect(x + 23, y + 38, 6, 5);
        ctx.fillRect(x + 23, y + 41, 8, 3);
    } else {
        ctx.fillRect(x + 13, y + 38, 6, 5);
        ctx.fillRect(x + 13, y + 41, 8, 3);
        ctx.fillRect(x + 23, y + 38, 6, 10);
        ctx.fillRect(x + 23, y + 45, 9, 3);
    }

    // Olho
    if (!alive) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 25, y + 3, 7, 7);
        ctx.fillStyle = '#11111b';
        ctx.fillRect(x + 27, y + 5, 3, 3);
    } else {
        ctx.fillStyle = eyeColor;
        ctx.fillRect(x + 26, y + 4, 4, 4);
    }

    // Contorno discreto no topo da cabeça para o jogador local
    if (outlineColor) {
        ctx.fillStyle = outlineColor;
        ctx.fillRect(x + 24, y - 9, 10, 3);
        ctx.fillRect(x + 27, y - 6, 4, 3);
    }
}

function drawDuckingDino(player, tick, outlineColor, eyeColor) {
    const { x, y, color, alive } = player;
    const step = Math.floor(tick / 5) % 2;

    ctx.fillStyle = color;
    // Cauda esticada
    ctx.fillRect(x, y + 6, 10, 8);
    // Tronco horizontal
    ctx.fillRect(x + 8, y + 4, 28, 15);
    // Cabeça projetada para frente
    ctx.fillRect(x + 34, y + 2, 24, 14);
    ctx.fillRect(x + 38, y + 15, 16, 3);
    // Braço
    ctx.fillRect(x + 30, y + 18, 6, 4);

    // Pernas rápidas
    if (step === 0) {
        ctx.fillRect(x + 14, y + 19, 6, 9);
        ctx.fillRect(x + 14, y + 25, 9, 3);
        ctx.fillRect(x + 24, y + 19, 6, 5);
    } else {
        ctx.fillRect(x + 14, y + 19, 6, 5);
        ctx.fillRect(x + 24, y + 19, 6, 9);
        ctx.fillRect(x + 24, y + 25, 9, 3);
    }

    // Olho
    if (!alive) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 42, y + 4, 6, 6);
        ctx.fillStyle = '#11111b';
        ctx.fillRect(x + 44, y + 6, 2, 2);
    } else {
        ctx.fillStyle = eyeColor;
        ctx.fillRect(x + 43, y + 5, 4, 4);
    }

    if (outlineColor) {
        ctx.fillStyle = outlineColor;
        ctx.fillRect(x + 38, y - 7, 10, 3);
        ctx.fillRect(x + 41, y - 4, 4, 3);
    }
}

function drawDino(player, isMe, tick, textColor, eyeColor) {
    // Pisca quando está invulnerável (ao entrar em uma corrida em andamento)
    if (player.invulnerable && Math.floor(tick / 4) % 2 === 0) {
        return;
    }

    ctx.save();
    ctx.globalAlpha = isMe ? 1 : 0.52;

    const indicatorColor = isMe ? textColor : null;
    if (player.isDucking && player.alive) {
        drawDuckingDino(player, tick, indicatorColor, eyeColor);
    } else {
        drawStandingDino(player, tick, indicatorColor, eyeColor);
    }

    // Rótulo com nome acima dos outros corredores
    if (!isMe) {
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = textColor;
        ctx.fillText(player.name, player.x + player.width / 2, player.y - 8);
    }

    ctx.restore();
}

function drawHUD(textColor, mutedColor) {
    const me = myId ? currentState.players[myId] : null;
    const displayScore = me ? me.score : currentState.score;
    const isFlashing = performance.now() < flashUntil;
    const hideFlashFrame = isFlashing && Math.floor(performance.now() / 120) % 2 === 0;

    // Placar clássico estilo Chrome Dino no canto superior direito
    ctx.font = 'bold 20px "Courier New", Courier, monospace';
    ctx.textAlign = 'right';

    ctx.fillStyle = mutedColor;
    ctx.fillText(`HI ${formatScore(currentState.highScore)}`, canvas.width - 108, 34);

    if (!hideFlashFrame) {
        ctx.fillStyle = textColor;
        ctx.fillText(formatScore(displayScore), canvas.width - 24, 34);
    }

    // Velocidade e contagem de sobreviventes no canto superior esquerdo
    const playersList = Object.values(currentState.players);
    const aliveCount = playersList.filter((p) => p.alive).length;
    const speedFactor = (currentState.speed / (currentState.baseSpeed || 6.5)).toFixed(1);

    ctx.font = 'bold 13px "Courier New", Courier, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = mutedColor;
    ctx.fillText(`VEL ${speedFactor}x  •  VIVOS ${aliveCount}/${playersList.length}`, 20, 30);
}

function drawOverlay(textColor, skyBg) {
    const me = myId ? currentState.players[myId] : null;

    if (currentState.status === 'waiting') {
        ctx.save();
        ctx.fillStyle = textColor;
        ctx.font = 'bold 22px "Courier New", Courier, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PRESSIONE ESPAÇO OU ↑ PARA COMEÇAR', canvas.width / 2, 128);

        ctx.font = '14px "Segoe UI", sans-serif';
        ctx.globalAlpha = 0.78;
        ctx.fillText('Pule os cactos e abaixe-se para desviar dos pterodáctilos!', canvas.width / 2, 156);
        ctx.restore();
        return;
    }

    if (currentState.status === 'running' && me && !me.alive) {
        ctx.save();
        ctx.fillStyle = 'rgba(17, 17, 27, 0.78)';
        ctx.fillRect(canvas.width / 2 - 205, 50, 410, 34);
        ctx.fillStyle = '#f9e2af';
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Você bateu! Assistindo os sobreviventes da rodada...', canvas.width / 2, 72);
        ctx.restore();
        return;
    }

    if (currentState.status === 'gameover') {
        ctx.save();
        ctx.fillStyle = currentState.isNight ? 'rgba(24, 24, 37, 0.72)' : 'rgba(247, 247, 247, 0.72)';
        ctx.fillRect(canvas.width / 2 - 230, 68, 460, 126);

        ctx.fillStyle = textColor;
        ctx.font = 'bold 28px "Courier New", Courier, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('G A M E   O V E R', canvas.width / 2, 106);

        if (currentState.lastWinner) {
            ctx.font = 'bold 15px "Segoe UI", sans-serif';
            ctx.fillText(
                `🏆 Vencedor da rodada: ${currentState.lastWinner.name} (${formatScore(currentState.lastWinner.score)})`,
                canvas.width / 2,
                134
            );
        }

        // Botão visual de reiniciar
        const bx = canvas.width / 2 - 18;
        const by = 146;
        ctx.fillStyle = textColor;
        ctx.fillRect(bx, by, 36, 28);
        ctx.fillStyle = skyBg;
        ctx.font = 'bold 18px "Segoe UI", sans-serif';
        ctx.fillText('↻', canvas.width / 2, by + 20);

        ctx.fillStyle = textColor;
        ctx.font = '13px "Segoe UI", sans-serif';
        ctx.globalAlpha = 0.85;
        ctx.fillText('Pressione ESPAÇO ou clique para reiniciar', canvas.width / 2, 190);
        ctx.restore();
    }
}

// Loop principal de renderização (60 FPS no navegador)
function render() {
    // Interpolação suave do ciclo dia/noite
    const targetNight = currentState.isNight ? 1 : 0;
    nightBlend += (targetNight - nightBlend) * 0.04;

    const skyBg = lerpColor([247, 247, 247], [24, 25, 38], nightBlend);
    const fgColor = lerpColor([83, 83, 83], [205, 214, 244], nightBlend);
    const mutedColor = lerpColor([135, 135, 135], [147, 153, 178], nightBlend);
    const cloudColor = lerpColor([220, 220, 220], [54, 58, 79], nightBlend);
    const eyeColor = lerpColor([247, 247, 247], [24, 25, 38], nightBlend);

    // Fundo do céu
    ctx.fillStyle = skyBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Estrelas e lua no modo noite
    if (nightBlend > 0.15) {
        ctx.save();
        ctx.globalAlpha = nightBlend;
        ctx.fillStyle = '#f9e2af';
        stars.forEach((star) => {
            ctx.fillRect(star.x, star.y, star.size, star.size);
        });
        drawMoon(780, 48, '#f9e2af');
        ctx.restore();
    }

    // Nuvens em parallax
    clouds.forEach((cloud) => {
        if (currentState.status === 'running') {
            cloud.x -= currentState.speed * 0.16;
            if (cloud.x < -70) {
                cloud.x = canvas.width + 40;
            }
        }
        drawCloud(Math.round(cloud.x), cloud.y, cloud.scale, cloudColor);
    });

    // Linha do chão do deserto + pedrinhas
    const groundY = config.groundY;
    ctx.fillStyle = fgColor;
    ctx.fillRect(0, groundY, canvas.width, 2);

    groundBumps.forEach((bump) => {
        let bx = bump.offset - currentState.groundOffset;
        if (bx < 0) bx += canvas.width;
        ctx.fillRect(bx, groundY + bump.yOffset, bump.width, 2);
    });

    // Obstáculos (cactos e pterodáctilos)
    currentState.obstacles.forEach((obs) => {
        if (obs.type === 'ptero') {
            drawPtero(obs, fgColor, currentState.tick);
        } else {
            drawCactus(obs, fgColor);
        }
    });

    // Desenha outros jogadores primeiro e o jogador local por cima
    const players = Object.values(currentState.players);
    players.forEach((player) => {
        if (player.id !== myId) {
            drawDino(player, false, currentState.tick, fgColor, eyeColor);
        }
    });

    const me = myId ? currentState.players[myId] : null;
    if (me) {
        drawDino(me, true, currentState.tick, fgColor, eyeColor);
    }

    // HUD e mensagens de estado
    drawHUD(fgColor, mutedColor);
    drawOverlay(fgColor, skyBg);

    requestAnimationFrame(render);
}

requestAnimationFrame(render);

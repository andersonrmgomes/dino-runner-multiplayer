const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve os arquivos estáticos da pasta public
app.use(express.static('public'));

// Configurações da pista e física (60 ticks/segundo)
const TICK_RATE = 60;
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 300;
const GROUND_Y = 248;

const DINO_X = 80;
const DINO_WIDTH = 44;
const DINO_HEIGHT = 48;
const DINO_DUCK_WIDTH = 58;
const DINO_DUCK_HEIGHT = 28;

const GRAVITY = 0.72;
const FAST_FALL_GRAVITY = 2.1;
const JUMP_VELOCITY = -13.4;

const BASE_SPEED = 6.5;
const MAX_SPEED = 15.5;
const SPEED_INCREMENT = 0.0018;

const HITBOX_PADDING_X = 8;
const HITBOX_PADDING_Y = 6;
const OBSTACLE_PADDING = 4;
const RESTART_COOLDOWN_MS = 450;

const DINO_COLORS = [
    '#2ecc71',
    '#3498db',
    '#e74c3c',
    '#f39c12',
    '#9b59b6',
    '#1abc9c',
    '#e84393',
    '#00cec9'
];

let nextObstacleId = 1;
let colorIndex = 0;

// Estado oficial do jogo (Fonte da Verdade no servidor)
const gameState = {
    status: 'waiting', // 'waiting' | 'running' | 'gameover'
    speed: BASE_SPEED,
    distance: 0,
    score: 0,
    highScore: 0,
    groundOffset: 0,
    isNight: false,
    tick: 0,
    lastWinner: null,
    restartAllowedAt: 0,
    nextObstacleGap: 300,
    obstacles: [],
    players: {}
};

function getNextColor() {
    const color = DINO_COLORS[colorIndex % DINO_COLORS.length];
    colorIndex += 1;
    return color;
}

function sanitizeName(rawName, fallbackId) {
    const cleaned = String(rawName || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 14);
    return cleaned || `Dino-${fallbackId.substring(0, 4)}`;
}

function createPlayer(socketId) {
    const isRunning = gameState.status === 'running';
    const isGameOver = gameState.status === 'gameover';

    return {
        id: socketId,
        name: `Dino-${socketId.substring(0, 4)}`,
        color: getNextColor(),
        x: DINO_X,
        y: GROUND_Y - DINO_HEIGHT,
        vy: 0,
        width: DINO_WIDTH,
        height: DINO_HEIGHT,
        isJumping: false,
        isDucking: false,
        alive: !isGameOver,
        score: 0,
        bestScore: 0,
        wins: 0,
        distance: 0,
        invulnerableTicks: isRunning ? TICK_RATE * 2 : 0,
        jumpBufferTicks: 0
    };
}

function resetPlayerForRound(player) {
    player.x = DINO_X;
    player.y = GROUND_Y - DINO_HEIGHT;
    player.vy = 0;
    player.width = DINO_WIDTH;
    player.height = DINO_HEIGHT;
    player.isJumping = false;
    player.isDucking = false;
    player.alive = true;
    player.score = 0;
    player.distance = 0;
    player.invulnerableTicks = 0;
    player.jumpBufferTicks = 0;
}

function resetWorldToWaiting() {
    gameState.status = 'waiting';
    gameState.speed = BASE_SPEED;
    gameState.distance = 0;
    gameState.score = 0;
    gameState.groundOffset = 0;
    gameState.isNight = false;
    gameState.lastWinner = null;
    gameState.obstacles = [];
    gameState.nextObstacleGap = 300;
}

function startNewRound(starterId = null) {
    gameState.status = 'running';
    gameState.speed = BASE_SPEED;
    gameState.distance = 0;
    gameState.score = 0;
    gameState.isNight = false;
    gameState.lastWinner = null;
    gameState.obstacles = [];
    gameState.nextObstacleGap = 320;

    for (const id in gameState.players) {
        resetPlayerForRound(gameState.players[id]);
    }

    // Dá o pulo inicial característico para quem iniciou a corrida
    if (starterId && gameState.players[starterId]) {
        triggerJump(gameState.players[starterId]);
    }
}

function triggerJump(player) {
    if (!player.alive) return;

    if (!player.isJumping) {
        player.isDucking = false;
        player.width = DINO_WIDTH;
        player.height = DINO_HEIGHT;
        player.y = GROUND_Y - DINO_HEIGHT;
        player.vy = JUMP_VELOCITY;
        player.isJumping = true;
        player.jumpBufferTicks = 0;
    } else {
        // Buffer curto para pular no frame exato em que tocar o chão
        player.jumpBufferTicks = 7;
    }
}

function spawnObstacle() {
    const canSpawnPtero = gameState.score >= 200;
    const roll = Math.random();
    let obstacle;

    if (canSpawnPtero && roll < 0.28) {
        // Pterodáctilo em 3 alturas possíveis (baixo, médio para abaixar, alto)
        const heights = [GROUND_Y - 34, GROUND_Y - 60, GROUND_Y - 94];
        const y = heights[Math.floor(Math.random() * heights.length)];
        obstacle = {
            id: nextObstacleId++,
            type: 'ptero',
            x: CANVAS_WIDTH + 20,
            y,
            width: 46,
            height: 30,
            variant: 0
        };
    } else if (roll < 0.56) {
        obstacle = {
            id: nextObstacleId++,
            type: 'cactus_small',
            x: CANVAS_WIDTH + 20,
            y: GROUND_Y - 38,
            width: 22,
            height: 38,
            variant: Math.floor(Math.random() * 2)
        };
    } else if (roll < 0.82) {
        obstacle = {
            id: nextObstacleId++,
            type: 'cactus_large',
            x: CANVAS_WIDTH + 20,
            y: GROUND_Y - 52,
            width: 28,
            height: 52,
            variant: Math.floor(Math.random() * 2)
        };
    } else {
        obstacle = {
            id: nextObstacleId++,
            type: 'cactus_cluster',
            x: CANVAS_WIDTH + 20,
            y: GROUND_Y - 42,
            width: 54,
            height: 42,
            variant: Math.floor(Math.random() * 2)
        };
    }

    gameState.obstacles.push(obstacle);

    // Garante espaçamento mínimo sempre transponível conforme a velocidade atual
    const minGap = Math.max(250, Math.floor(gameState.speed * 34));
    const randomExtra = Math.floor(Math.random() * 220);
    gameState.nextObstacleGap = minGap + randomExtra;
}

function checkCollision(player, obstacle) {
    const px = player.x + HITBOX_PADDING_X;
    const py = player.y + HITBOX_PADDING_Y;
    const pw = player.width - HITBOX_PADDING_X * 2;
    const ph = player.height - HITBOX_PADDING_Y * 2;

    const ox = obstacle.x + OBSTACLE_PADDING;
    const oy = obstacle.y + OBSTACLE_PADDING;
    const ow = obstacle.width - OBSTACLE_PADDING * 2;
    const oh = obstacle.height - OBSTACLE_PADDING * 2;

    return px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy;
}

function finishRoundIfNoSurvivors() {
    const players = Object.values(gameState.players);
    if (players.length === 0) {
        resetWorldToWaiting();
        return;
    }

    const aliveCount = players.filter((p) => p.alive).length;
    if (aliveCount === 0 && gameState.status === 'running') {
        gameState.status = 'gameover';
        gameState.restartAllowedAt = Date.now() + RESTART_COOLDOWN_MS;

        // Define vencedor da rodada quando há mais de 1 jogador
        const sorted = [...players].sort((a, b) => b.score - a.score);
        if (sorted.length > 1 && sorted[0].score > 0) {
            sorted[0].wins += 1;
            gameState.lastWinner = {
                id: sorted[0].id,
                name: sorted[0].name,
                score: sorted[0].score
            };
        } else {
            gameState.lastWinner = null;
        }
    }
}

function updateGame() {
    gameState.tick += 1;

    if (gameState.status !== 'running') {
        return;
    }

    const players = Object.values(gameState.players);
    if (players.length === 0) {
        resetWorldToWaiting();
        return;
    }

    // Acelera progressivamente a corrida
    gameState.speed = Math.min(MAX_SPEED, gameState.speed + SPEED_INCREMENT);
    gameState.distance += gameState.speed;
    gameState.groundOffset = (gameState.groundOffset + gameState.speed) % CANVAS_WIDTH;
    gameState.score = Math.floor(gameState.distance / 10);

    // Ciclo Dia / Noite clássico a cada 700 pontos (noite por 220 pontos)
    const cyclePos = gameState.score % 700;
    gameState.isNight = gameState.score >= 500 && cyclePos >= 500;

    // Move e remove obstáculos que saíram da tela
    for (let i = gameState.obstacles.length - 1; i >= 0; i--) {
        const obs = gameState.obstacles[i];
        const extraSpeed = obs.type === 'ptero' ? 1.15 : 0;
        obs.x -= gameState.speed + extraSpeed;

        if (obs.x + obs.width < -20) {
            gameState.obstacles.splice(i, 1);
        }
    }

    // Spawna novos obstáculos
    const lastObstacle = gameState.obstacles[gameState.obstacles.length - 1];
    if (!lastObstacle || CANVAS_WIDTH - lastObstacle.x >= gameState.nextObstacleGap) {
        spawnObstacle();
    }

    // Atualiza física e colisões de cada jogador vivo
    for (const player of players) {
        if (!player.alive) continue;

        if (player.invulnerableTicks > 0) {
            player.invulnerableTicks -= 1;
        }

        if (player.jumpBufferTicks > 0) {
            player.jumpBufferTicks -= 1;
        }

        // Física vertical
        if (player.isJumping) {
            const currentGravity = player.isDucking ? FAST_FALL_GRAVITY : GRAVITY;
            player.vy += currentGravity;
            player.y += player.vy;

            const targetHeight = player.isDucking ? DINO_DUCK_HEIGHT : DINO_HEIGHT;
            const targetWidth = player.isDucking ? DINO_DUCK_WIDTH : DINO_WIDTH;
            const floorY = GROUND_Y - targetHeight;

            if (player.y >= floorY) {
                player.y = floorY;
                player.vy = 0;
                player.isJumping = false;
                player.width = targetWidth;
                player.height = targetHeight;

                if (player.jumpBufferTicks > 0) {
                    triggerJump(player);
                }
            }
        } else {
            // Ajusta altura conforme agachado ou em pé
            const targetHeight = player.isDucking ? DINO_DUCK_HEIGHT : DINO_HEIGHT;
            const targetWidth = player.isDucking ? DINO_DUCK_WIDTH : DINO_WIDTH;
            player.width = targetWidth;
            player.height = targetHeight;
            player.y = GROUND_Y - targetHeight;
        }

        // Pontuação individual do jogador
        player.distance += gameState.speed;
        player.score = Math.floor(player.distance / 10);

        if (player.score > player.bestScore) {
            player.bestScore = player.score;
        }
        if (player.score > gameState.highScore) {
            gameState.highScore = player.score;
        }

        // Verifica colisão com obstáculos
        if (player.invulnerableTicks <= 0) {
            for (const obs of gameState.obstacles) {
                if (checkCollision(player, obs)) {
                    player.alive = false;
                    player.isDucking = false;
                    break;
                }
            }
        }
    }

    finishRoundIfNoSurvivors();
}

function getPublicState() {
    const publicPlayers = {};
    for (const id in gameState.players) {
        const p = gameState.players[id];
        publicPlayers[id] = {
            id: p.id,
            name: p.name,
            color: p.color,
            x: Math.round(p.x),
            y: Math.round(p.y),
            width: p.width,
            height: p.height,
            isJumping: p.isJumping,
            isDucking: p.isDucking,
            alive: p.alive,
            score: p.score,
            bestScore: p.bestScore,
            wins: p.wins,
            invulnerable: p.invulnerableTicks > 0
        };
    }

    return {
        status: gameState.status,
        speed: Number(gameState.speed.toFixed(2)),
        baseSpeed: BASE_SPEED,
        score: gameState.score,
        highScore: gameState.highScore,
        groundOffset: Math.floor(gameState.groundOffset),
        isNight: gameState.isNight,
        tick: gameState.tick,
        lastWinner: gameState.lastWinner,
        obstacles: gameState.obstacles.map((o) => ({
            id: o.id,
            type: o.type,
            x: Math.round(o.x),
            y: Math.round(o.y),
            width: o.width,
            height: o.height,
            variant: o.variant
        })),
        players: publicPlayers
    };
}

function broadcastState() {
    io.emit('stateUpdate', getPublicState());
}

// Loop principal do servidor (60 FPS)
setInterval(() => {
    const wasRunning = gameState.status === 'running';
    updateGame();

    if (wasRunning || gameState.status === 'running') {
        broadcastState();
    }
}, 1000 / TICK_RATE);

io.on('connection', (socket) => {
    console.log(`Jogador conectado: ${socket.id}`);

    gameState.players[socket.id] = createPlayer(socket.id);

    socket.emit('init', {
        id: socket.id,
        config: {
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            groundY: GROUND_Y,
            dinoWidth: DINO_WIDTH,
            dinoHeight: DINO_HEIGHT,
            dinoDuckWidth: DINO_DUCK_WIDTH,
            dinoDuckHeight: DINO_DUCK_HEIGHT
        }
    });

    broadcastState();

    socket.on('setName', (data) => {
        const player = gameState.players[socket.id];
        if (!player) return;
        player.name = sanitizeName(data && data.name, socket.id);
        broadcastState();
    });

    socket.on('playerAction', (data) => {
        const player = gameState.players[socket.id];
        if (!player || !data) return;

        const { type } = data;

        if (type === 'restart') {
            if (gameState.status === 'gameover' && Date.now() >= gameState.restartAllowedAt) {
                startNewRound(socket.id);
                broadcastState();
            } else if (gameState.status === 'waiting') {
                startNewRound(socket.id);
                broadcastState();
            }
            return;
        }

        if (type === 'jump') {
            if (gameState.status === 'waiting') {
                startNewRound(socket.id);
                broadcastState();
                return;
            }
            if (gameState.status === 'gameover') {
                if (Date.now() >= gameState.restartAllowedAt) {
                    startNewRound(socket.id);
                    broadcastState();
                }
                return;
            }
            triggerJump(player);
            return;
        }

        if (type === 'duckStart') {
            if (gameState.status === 'running' && player.alive) {
                player.isDucking = true;
            }
            return;
        }

        if (type === 'duckEnd') {
            player.isDucking = false;
        }
    });

    socket.on('disconnect', () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        delete gameState.players[socket.id];
        finishRoundIfNoSurvivors();
        broadcastState();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor Dino Multiplayer rodando na porta ${PORT}`);
});

# 📘 Guia do Professor — Dino Runner Multiplayer

Roteiro prático para utilizar este projeto em aulas de **Desenvolvimento Web**, **JavaScript**, **Node.js**, **Redes / WebSockets** ou **Desenvolvimento de Jogos 2D** (duração sugerida: **60 a 90 minutos**).

---

## ✅ Checklist Antes da Aula (5 min)

1. Confirme que o **Node.js 18+** está instalado na máquina do professor (`node -v`).
2. Rode `npm install` e depois `npm run dev` (o modo `--watch` reinicia o servidor automaticamente quando você editar o `server.js` ao vivo).
3. Teste o acesso em um segundo dispositivo (celular ou outro PC na mesma rede Wi-Fi/cabo) usando o **IP Local e Porta** exibido no painel lateral ou clicando em **QR Code**.
4. Se o segundo dispositivo não conectar, libere o **Node.js** no **Firewall do Windows** (redes privadas) ou permita a porta TCP `3000`.

---

## 🗓️ Roteiro Sugerido de Aula

### Etapa 1 — Quebra-gelo Jogando Juntos (10 min)
- Projete a tela do jogo no datashow e clique em **QR Code** (ou passe o endereço `http://SEU-IP:3000`).
- Peça para os alunos entrarem, colocarem seus apelidos e jogarem 2 ou 3 rodadas.
- **Pontos para destacar durante a partida:**
  - Contagem regressiva `3... 2... 1...` sincronizada para todos largarem juntos.
  - A **coroa dourada 👑** acompanha automaticamente o líder da rodada.
  - A **estrela dourada ⭐** no céu concede **+50 pontos** e um **escudo 🛡️** (apenas o primeiro a pegar leva — ótimo exemplo de estado compartilhado!).
  - Em turmas grandes, mostre o botão **👀 Todos / 🎯 Só eu** (Modo Foco).

### Etapa 2 — Modo Debug ao Vivo: Hitboxes e Latência (10 min)
- Pressione a tecla **`H`** (ou clique em **🐞 Debug**).
- Mostre para a turma:
  - Os retângulos verdes (dinossauros), vermelhos (obstáculos) e dourado (estrela): essa é a **colisão AABB** (Axis-Aligned Bounding Box) rodando no servidor.
  - Note como a caixa verde é ligeiramente menor que o desenho (*hitbox forgiveness*) e como ela **achata** quando o dinossauro abaixa para passar sob o pterodáctilo médio.
  - Mostre o **Ping (ms)** no topo: explique que na rede local ele fica em ~1–10 ms, enquanto em servidores remotos na internet costuma ficar entre 30–150 ms.

### Etapa 3 — Explicando a Arquitetura (15 min)
- Abra o diagrama do `README.md` e explique a divisão de responsabilidades:
  - **`server.js` (Cérebro / Fonte da Verdade):** não desenha nada! Apenas calcula física (`updateGame`), gera obstáculos (`spawnObstacle`), checa colisões (`checkCollision`) e distribui o estado 60 vezes por segundo (`stateUpdate`).
  - **`public/client.js` (Olhos e Mãos):** envia intenções (`playerAction`), recebe `stateUpdate`, sintetiza áudio 8-bit (`playTone`) e desenha tudo em retângulos (`ctx.fillRect`) no Canvas (`render`).
- **Pergunta para provocar a turma:** *"Por que a colisão não é calculada no `client.js`?"* (Resposta: para evitar trapaça no DevTools e garantir que todos vejam exatamente a mesma corrida).

### Etapa 4 — Experimentação ao Vivo com `npm run dev` (15 min)
Altere constantes no topo do `server.js` com a turma assistindo e salve (o servidor reinicia sozinho):
- Troque `GRAVITY = 0.72` para `0.3` → "Gravidade da Lua"!
- Troque `BASE_SPEED = 6.5` para `12` → "Modo Turbo"!
- Troque `DINO_COLORS` → adicione cores escolhidas pelos alunos.

### Etapa 5 — Mão na Massa: Desafios do `README.md` (20–40 min)
Divida a turma em duplas/grupos para resolverem os desafios por nível.

---

## 💡 Gabarito / Dicas Rápidas dos Desafios

| Desafio | Onde mexer | Dica rápida |
| :--- | :--- | :--- |
| **1. Novas cores** | `server.js` → `DINO_COLORS` | Adicione códigos hexadecimais como `'#ff6b6b'`, `'#f9e2af'`. |
| **2. Gravidade baixa** | `server.js` → `GRAVITY`, `JUMP_VELOCITY` | Diminua `GRAVITY` (ex.: `0.35`) e ajuste `JUMP_VELOCITY` (ex.: `-10`). |
| **3. Personalizar cores / ícone** | `public/client.js` (`render`) e `public/favicon.svg` | Altere os arrays RGB em `lerpColor(...)` e os `<rect>` do SVG. |
| **4. Novo obstáculo** | `server.js` (`spawnObstacle`) + `client.js` | Crie um `type: 'rock'` ou `'meteor'` e adicione um `else if` no `render()`. |
| **5. Bônus coletável** | `server.js` (`gameState.powerup`) | Já existe a **Estrela de Escudo** como referência! Peça para criarem uma segunda variação (ex.: moeda de `+100` pts sem escudo). |
| **6. Apelidos divertidos** | `server.js` (`createPlayer`) | Crie um array `const NAMES = ['Rex', 'Raptor', 'Velociraptor', ...]` e sorteie com `Math.random()`. |
| **7. Trocar por Sprites PNG** | `public/client.js` (`drawStandingDino`) | Carregue `const img = new Image(); img.src = 'dino.png';` e use `ctx.drawImage(img, x, y, width, height)`. |
| **8. Salas separadas** | `server.js` (`io.on('connection')`) | Leia `socket.handshake.query.room`, use `socket.join(room)` e mantenha um `rooms[room]` com estados independentes. |
| **9. Persistência de recorde** | `server.js` (`fs`) | Use `fs.writeFileSync('highscore.json', ...)` quando `highScore` mudar e leia na inicialização com `fs.readFileSync`. |

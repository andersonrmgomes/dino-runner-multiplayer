# Dino Runner Multiplayer — Tempo Real

Jogo 2D multiplayer estilo **Dinossauro do Chrome** desenvolvido com **HTML5 Canvas**, **CSS**, **JavaScript**, **Node.js** e **Socket.io**, mantendo a arquitetura autoritativa no servidor com comunicação bidirecional via WebSockets.

---

## Recursos

- **Multiplayer em tempo real:** vários jogadores correm juntos na mesma pista com obstáculos sincronizados pelo servidor.
- **Mecânica fiel ao Chrome Dino:**
  - Pulo com buffer responsivo e **queda rápida** ao pressionar para baixo no ar.
  - Movimento de **abaixar** para passar por baixo de pterodáctilos.
  - Velocidade progressiva conforme a distância percorrida.
  - **Ciclo dia e noite** automático com lua e estrelas.
  - Efeitos sonoros 8-bit gerados via **Web Audio API** (com botão de silenciar).
- **Placar ao vivo:** exibe apelido personalizável, status (`Correndo` / `Eliminado`), pontuação atual, recorde pessoal, vitórias da rodada e recorde global da sala.
- **Modo solo ou em grupo:** jogue sozinho normalmente ou abra várias abas/dispositivos para competir.

---

## Controles

- **Espaço**, **Seta para cima (↑)** ou **W**: Pular / Iniciar / Reiniciar rodada
- **Seta para baixo (↓)** ou **S**: Abaixar (ou queda rápida quando estiver no ar)
- **Clique/Toque** no canvas ou nos botões na tela: suporte a mouse e dispositivos móveis

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) (versão 18 ou superior)

---

## Como Executar Localmente

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Inicie o servidor:
   ```bash
   npm start
   ```

3. Acesse no navegador:
   ```
   http://localhost:3000
   ```
   Abra duas ou mais abas para testar o modo multiplayer em tempo real!

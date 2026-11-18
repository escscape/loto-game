const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Отдаём HTML-файл
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Хранилище комнат
const rooms = {};

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.isHost = false;

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    // --- СОЗДАНИЕ КОМНАТЫ ---
    if (data.type === 'create') {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const bag = Array.from({ length: 90 }, (_, i) => i + 1);
      
      // перемешиваем
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      
      rooms[code] = {
        bag,
        drawn: [],
        clients: new Set()
      };
      
      ws.roomCode = code;
      ws.isHost = true;
      rooms[code].clients.add(ws);
      
      ws.send(JSON.stringify({ type: 'created', code, drawn: [], remaining: 90 }));
    }

    // --- ПОДКЛЮЧЕНИЕ К КОМНАТЕ ---
    if (data.type === 'join') {
      const code = data.code;
      const room = rooms[code];
      
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Комната не найдена' }));
        return;
      }
      
      ws.roomCode = code;
      room.clients.add(ws);
      
      // Отправляем текущее состояние
      ws.send(JSON.stringify({ 
        type: 'joined', 
        drawn: room.drawn, 
        remaining: room.bag.length 
      }));
    }

    // --- ВЫТЯГИВАНИЕ БОЧОНКА (только для ведущего) ---
    if (data.type === 'draw' && ws.isHost && rooms[ws.roomCode]) {
      const room = rooms[ws.roomCode];
      
      if (room.bag.length === 0) {
        ws.send(JSON.stringify({ type: 'empty' }));
        return;
      }
      
      const n = room.bag.pop();
      room.drawn.push(n);
      
      // Рассылаем всем в комнате
      const msg = JSON.stringify({ 
        type: 'number', 
        n, 
        drawn: room.drawn, 
        remaining: room.bag.length 
      });
      
      for (const client of room.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    }

    // --- НАЧАТЬ ЗАНОВО (только для ведущего) ---
    if (data.type === 'reset' && ws.isHost && rooms[ws.roomCode]) {
      const room = rooms[ws.roomCode];
      const bag = Array.from({ length: 90 }, (_, i) => i + 1);
      
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      
      room.bag = bag;
      room.drawn = [];
      
      const msg = JSON.stringify({ type: 'reset', drawn: [], remaining: 90 });
      
      for (const client of room.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    }
  });

  ws.on('close', () => {
    if (ws.roomCode && rooms[ws.roomCode]) {
      rooms[ws.roomCode].clients.delete(ws);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
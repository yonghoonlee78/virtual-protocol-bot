// backend/src/services/websocket.js
const socketIO = require('socket.io');

function setupWebSocket(server) {
  const io = socketIO(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  
  io.on('connection', (socket) => {
    console.log('👤 User connected');
    
    socket.on('subscribe', async (agentAddress) => {
      socket.join(`agent:${agentAddress}`);
      console.log(`Subscribed to ${agentAddress}`);
    });
    
    socket.on('disconnect', () => {
      console.log('👤 User disconnected');
    });
  });
  
  return io;
}

module.exports = setupWebSocket;
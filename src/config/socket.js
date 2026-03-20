import { Server } from "socket.io";

let io;

export const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // allow all origins for now
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Client can join their own room to receive private notifications
    socket.on("join", (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
        console.log(`[Socket.io] Socket ${socket.id} joined room user_${userId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  console.log("Socket.io initialized successfully.");
  return io;
};

export const getIO = () => {
  if (!io) {
    console.warn("Socket.io has not been initialized yet!");
  }
  return io;
};

export const pushInAppNotification = (userId, payload) => {
  const socketIo = getIO();
  if (socketIo && userId) {
    socketIo.to(`user_${userId}`).emit("new_notification", payload);
    return true;
  }
  return false;
};

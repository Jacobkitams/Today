from fastapi import WebSocket
from typing import List
import json
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Store active WebSocket connections
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        """
        Broadcast a JSON message to all connected clients.
        """
        if not self.active_connections:
            return
            
        json_msg = json.dumps(message)
        dead_connections = []
        
        for connection in self.active_connections:
            try:
                await connection.send_text(json_msg)
            except Exception as e:
                logger.error(f"Error broadcasting to a websocket client: {e}")
                dead_connections.append(connection)
                
        # Clean up any dead connections
        for dead in dead_connections:
            self.disconnect(dead)

# Global singleton instance
manager = ConnectionManager()

import os
import json
import base64
import cv2
import numpy as np
import asyncio
from fastapi import FastAPI, BackgroundTasks, WebSocket, WebSocketDisconnect, UploadFile, File, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.vision.processor import VisionProcessor

app = FastAPI(title="AI Smart Auto Focus System")

# Ensure required directories exist
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)
os.makedirs("templates", exist_ok=True)
os.makedirs("uploads", exist_ok=True)

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Initialize our Vision Processor
processor = VisionProcessor()

# Session state to store object tracking per client
# In production, this would be tied to user session IDs
client_sessions = {}

class TrackPoint(BaseModel):
    x: float
    y: float
    width: float # Original video width
    height: float # Original video height
    client_id: str

@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """ Endpoint to upload MP4 files for processing. """
    file_location = f"uploads/{file.filename}"
    with open(file_location, "wb+") as file_object:
        file_object.write(file.file.read())
    return {"info": f"file '{file.filename}' saved at '{file_location}'", "filename": file.filename}

@app.post("/select_object")
async def select_object(data: TrackPoint):
    """
    User clicks on a point in the frontend. We map this (x, y) coordinates
    to select the tracking ID of the bounding box that contains this point.
    """
    client_id = data.client_id
    if client_id not in client_sessions:
        client_sessions[client_id] = {"tracking_id": None, "target_point": None}
    
    # Store the clicked point and original dimensions for resolving the tracking ID
    # in the next frame processing.
    client_sessions[client_id]["target_point"] = (data.x, data.y, data.width, data.height)
    
    return {"status": "success", "message": f"Object selected at {data.x}, {data.y}"}

@app.websocket("/webcam/{client_id}")
async def webcam_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    if client_id not in client_sessions:
         client_sessions[client_id] = {"tracking_id": None, "target_point": None, "blur_enabled": True}
         
    try:
        while True:
            # Receive base64 encoded image frame from frontend
            data = await websocket.receive_text()
            
            # Check for control messages
            if data.startswith("control:"):
                cmd = data.split(":")[1]
                if cmd == "toggle_blur":
                    current = client_sessions[client_id].get("blur_enabled", True)
                    client_sessions[client_id]["blur_enabled"] = not current
                elif cmd == "clear_focus":
                    client_sessions[client_id]["tracking_id"] = None
                    client_sessions[client_id]["target_point"] = None
                continue

            # Decode the image frame (base64 data URL)
            try:
                # The data is expected to be 'data:image/jpeg;base64,...'
                encoded_data = data.split(',')[1]
                nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            except Exception as e:
                print(f"Error decoding image: {e}")
                await websocket.send_text("cmd:error")
                continue
                
            if frame is None:
                await websocket.send_text("cmd:error")
                continue
            
            # Get current session state
            session = client_sessions[client_id]
            target_pt = session.get("target_point")
            tracking_id = session.get("tracking_id")
            blur_enabled = session.get("blur_enabled", True)
            
            try:
                # Offload heavy YOLO processing to a background thread.
                # Since YOLO is now lazily initialized in processor, it will safely 
                # bind to this thread without deadlocking Windows.
                processed_frame, new_tracking_id, detected_count, tracked_class = await asyncio.to_thread(
                    processor.process_frame,
                    frame, 
                    target_point=target_pt, 
                    current_tracking_id=tracking_id,
                    apply_blur=blur_enabled
                )
                
                # If the user just clicked, update the tracking ID and clear the target point
                if target_pt is not None:
                    client_sessions[client_id]["tracking_id"] = new_tracking_id
                    client_sessions[client_id]["target_point"] = None
                    
                # Encode frame back to base64 to send to client
                # LOWERED QUALITY TO 50 for extreme speed improvements on websocket transmission
                _, buffer = cv2.imencode('.jpg', processed_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 50])
                b64_img = base64.b64encode(buffer).decode('utf-8')
                
                payload = {
                     "image": f"data:image/jpeg;base64,{b64_img}",
                     "detected_count": int(detected_count),
                     "tracked_class": str(tracked_class).capitalize(),
                     "tracking_id": int(new_tracking_id) if new_tracking_id is not None else -1
                }
                
                await websocket.send_text(json.dumps(payload))
            except Exception as loop_e:
                import traceback
                error_trace = traceback.format_exc()
                print(f"Exception during processing: {error_trace}")
                
                # Send the specific error message back to the frontend
                await websocket.send_text(f"cmd:error:{str(loop_e)}")
                continue
            
    except WebSocketDisconnect:
        print(f"Client {client_id} disconnected")
        if client_id in client_sessions:
            del client_sessions[client_id]

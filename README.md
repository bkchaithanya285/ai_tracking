# AI-Based Smart Auto Focus & Dynamic Subject Tracking System

A full-stack, real-time web application that allows users to upload an MP4 video or use their webcam to automatically track and keep any subject in sharp focus while dynamically blurring the background.

## 🚀 Key Features

*   **Real-Time Object Tracking:** Uses YOLOv8 (FP16 half-precision) and ByteTrack for lightning-fast, highly accurate bounding-box tracking.
*   **Dynamic Background Blur:** Implements optimized OpenCV operations to instantly apply depth-of-field effects around the tracked subject.
*   **Extreme Performance:** Uniquely optimized for CPU execution. Uses downscale-blur-upscale mapping, low-latency WebSocket image compression, and resolution bounding to achieve maximum frames per second without requiring a dedicated GPU.
*   **Live Analytics Dashboard:** View active objects tracked, current bounding box IDs, and real-time FPS directly in the UI.
*   **Cinematic UI/UX:** Features a premium dark theme with dynamic glassmorphism panels and responsive layouts.
*   **Bonus Tools:** Built-in "Screenshot" and "Record Video" functions let you save your processed footage directly from the browser.

---

## 💻 Local Setup & Installation

Follow these steps to run the application perfectly on your local machine.

### Prerequisites

*   **Python 3.10+** (Ensure Python is added to your PATH)
*   **Git** (Optional, to clone the repo)

### 1. Clone & Enter the Directory

```bash
git clone <your-repository-url>
cd ai_based_smart_auto_focus
```

### 2. Create a Virtual Environment (Highly Recommended)

Creating a virtual environment isolates the project dependencies so it doesn't conflict with your global Python setup.

**On Windows:**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**On macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

Install all necessary libraries (FastAPI, OpenCV, Ultralytics, etc.) via pip:

```bash
pip install -r requirements.txt
```

### 4. Run the Backend Server

Start the Uvicorn server. This will launch the FastAPI backend.

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

*Note: The `--reload` flag automatically restarts the server if you make code changes.*

### 5. Open the Application

Once the server says `Application startup complete`, open your favorite web browser (Chrome, Edge, Safari) and navigate to:

**[http://localhost:8000](http://localhost:8000)**

---

## ☁️ Deployment Guide

This project is fully containerized and production-ready for deployment to platforms like Render, Heroku, or any Docker-compatible infrastructure.

### Deploying via Docker (Any Platform)

A full `Dockerfile` is included in the project root.

1.  **Build the Docker Image:**
    ```bash
    docker build -t smart-auto-focus .
    ```

2.  **Run the Docker Container:**
    ```bash
    docker run -p 8000:8000 smart-auto-focus
    ```
    Your app will now be available on port 8000.

### Deploying to Render.com / Heroku

This repository includes a `Procfile` configured for easy PaaS deployment.

1.  Create a new Web Service on Render or an App on Heroku.
2.  Connect your GitHub repository.
3.  Ensure your start command is set to:
    ```bash
    uvicorn app.main:app --host 0.0.0.0 --port $PORT
    ```
4.  Ensure you have your environment variables set if necessary, though this application requires zero API keys. 

---

## 🎯 How to Use the App

1.  **Start Source:** Choose to either `Start Webcam` or upload a local MP4 file.
2.  **Wait for AI Load:** Upon the first frame, YOLOv8 will lazily initialize in the backend. 
3.  **Click to Track:** Move your mouse over the video feed and simply click on the subject/person you wish to focus on. 
4.  **Observe Blur:** The backend will lock a tracking ID to that object and instantly blur the surrounding environment. 
5.  **Export:** Use the `📸 Screenshot` or `🔴 Record Video` buttons to save the active stream locally.

## 🛠 Tech Stack

*   **Backend:** Python, FastAPI, Uvicorn, WebSockets
*   **Computer Vision:** OpenCV (cv2), Ultralytics (YOLOv8n), Numpy
*   **Frontend:** Vanilla JavaScript, HTML5 Canvas, WebRTC, CSS3

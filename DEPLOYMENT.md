# 🚀 Complete Deployment Guide

This guide will walk you through exactly how to deploy your **AI Smart Auto Focus System** to the cloud so anyone in the world can access it. Because this application utilizes PyTorch and OpenCV natively, it requires an environment capable of installing native C++ dependencies.

## Option 1: Render.com (Easiest & Free Tier Available)
Render natively reads your `requirements.txt` and `Procfile` and builds the environment for you automatically.

### Steps:
1. Create a free account at [Render.com](https://render.com).
2. Click **New +** and select **Web Service**.
3. Choose **Build and deploy from a Git repository**.
4. Connect your GitHub account and select the repository: `ai_tracking`.
5. Configuration:
   * **Name**: `ai-smart-focus` (or your choice)
   * **Environment**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt && apt-get update && apt-get install -y libgl1 libglib2.0-0` *(Note: Since Render instances need OpenCV UI libraries, we chain the apt-get inside the build command, or you can use Docker on Render).*
   * **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   * **Plan**: Free or Starter
6. Click **Create Web Service**. 
7. Done! Render will give you a live URL once the build succeeds.

---

## Option 2: Docker / DigitalOcean App Platform (Highly Recommended)
We provided a complete `Dockerfile` that packages this app inside an isolated Linux container containing all the necessary `libgl1` dependencies.

### Local Docker Testing:
1. Ensure Docker Desktop is installed.
2. Build the image:
   ```bash
   docker build -t smart-focus-app .
   ```
3. Run the container:
   ```bash
   docker run -p 8000:8000 smart-focus-app
   ```

### Deploying the Docker Container to DigitalOcean:
1. Push your code to GitHub.
2. Go to DigitalOcean and click **Create -> Apps**.
3. Select your GitHub repository.
4. Under **Resource Type**, DigitalOcean will automatically detect your `Dockerfile`.
5. Keep the default HTTP port (usually 8000 or 8080).
6. Click **Deploy**. The Docker container will build in the cloud and spin up effortlessly.

---

## Option 3: Heroku
Similar to Render, but you must add a special "buildpack" for OpenCV dependencies.

### Steps:
1. Create a Heroku account and install the Heroku CLI.
2. Login `heroku login`.
3. Create the app: 
   ```bash
   heroku create ai-tracking-system
   ```
4. **CRITICAL**: Add the Apt buildpack required for `cv2`:
   ```bash
   heroku buildpacks:add --index 1 heroku-community/apt
   ```
5. Add the Python buildpack:
   ```bash
   heroku buildpacks:add --index 2 heroku/python
   ```
6. Create an `Aptfile` in the root of your project and put this inside:
   ```text
   libsm6
   libxext6
   libxrender-dev
   libglib2.0-0
   libgl1
   ```
7. Commit and Deploy:
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```
8. The app will be live at the URL Heroku provides.

---

## 🎯 Architecture Considerations for Production
- **WebSockets:** Make sure your platform (e.g. Nginx on AWS EC2) supports persistent WebSocket connections, as the entire processing stream relies on WebSockets rather than REST API calls.
- **CPU vs GPU:** The standard YOLOv8n model runs excellently on CPU. If you deploy this to a Serverless function (like AWS Lambda), WebSockets will timeout. You **MUST** deploy this as a persistent container/server (like an EC2 instance, Render Web Service, or DigitalOcean Droplet).

const clientId = Math.random().toString(36).substring(2, 15);
let ws;
let isStreaming = false;
let streamingInterval;
let blurEnabled = true;

const videoElement = document.getElementById('sourceVideo');
const outputCanvas = document.getElementById('outputCanvas');
const ctx = outputCanvas.getContext('2d');
const hiddenCanvas = document.createElement('canvas');
const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

const btnWebcam = document.getElementById('btnWebcam');
const videoUpload = document.getElementById('videoUpload');
const btnToggleBlur = document.getElementById('btnToggleBlur');
const btnClearFocus = document.getElementById('btnClearFocus');
const btnScreenshot = document.getElementById('btnScreenshot');
const btnRecord = document.getElementById('btnRecord');

const videoControls = document.getElementById('videoControls');
const btnPlayPause = document.getElementById('btnPlayPause');
const fpsCounter = document.getElementById('fpsCounter');
const systemStatus = document.getElementById('systemStatus');
const loadingOverlay = document.getElementById('loadingOverlay');

let mediaRecorder;
let recordedChunks = [];

let framesProcessed = 0;
let lastTime = performance.now();

// Calculate FPS
setInterval(() => {
    const now = performance.now();
    const fps = Math.round((framesProcessed * 1000) / (now - lastTime));
    fpsCounter.innerText = fps;
    framesProcessed = 0;
    lastTime = now;
}, 1000);

let framePending = false;

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/webcam/${clientId}`);

    ws.onopen = () => {
        systemStatus.innerText = "Online";
        systemStatus.className = "status-online";
    };

    ws.onclose = () => {
        systemStatus.innerText = "Offline";
        systemStatus.className = "status-offline";
        framePending = false; // Reset lock on disconnect
        // Attempt to reconnect
        setTimeout(connectWebSocket, 3000);
    };

    ws.onmessage = (event) => {
        // We received a processed frame from the backend
        framePending = false; // We can send the next frame now

        // Check for control messages
        if (event.data.startsWith("cmd:")) {
            if (event.data.startsWith("cmd:error:")) {
                const errMsg = event.data.substring(10);
                document.querySelector('#loadingOverlay p').innerText = "Python Error: " + errMsg;
                // Add artificial delay before retry to prevent console spam
                setTimeout(() => { framePending = false; }, 2000);
            } else if (event.data === "cmd:error") {
                document.querySelector('#loadingOverlay p').innerText = "Backend Error - Retrying...";
                setTimeout(() => { framePending = false; }, 2000);
            }
            return;
        }

        try {
            const data = JSON.parse(event.data);

            // update UI dynamic counters
            document.getElementById("detectedCount").innerText = data.detected_count;
            document.getElementById("trackedClass").innerText = data.tracked_class !== "None" ?
                `${data.tracked_class} (${data.tracking_id})` : "None";

            const img = new Image();
            img.onload = () => {
                // Match canvas size to image size
                if (outputCanvas.width !== img.width) outputCanvas.width = img.width;
                if (outputCanvas.height !== img.height) outputCanvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                framesProcessed++;
                loadingOverlay.classList.add('hidden');
            };
            img.onerror = () => {
                console.error("Received invalid image data from backend");
            };
            img.src = data.image;
        } catch (e) {
            document.querySelector('#loadingOverlay p').innerText = "Data Parse Error";
            console.error("Failed to parse backend payload", e);
        }
    };
}

function startStreaming() {
    if (isStreaming) return;
    isStreaming = true;
    framePending = false;
    loadingOverlay.classList.remove('hidden');
    document.querySelector('#loadingOverlay p').innerText = "Starting Stream...";

    videoElement.play().catch(e => {
        console.error("Error playing video:", e);
        document.querySelector('#loadingOverlay p').innerText = "Play Error: " + e.message;
    });

    const sendFrame = () => {
        if (!isStreaming) return;

        if (ws.readyState !== WebSocket.OPEN) {
            document.querySelector('#loadingOverlay p').innerText = "Connecting to Backend...";
            requestAnimationFrame(sendFrame);
            return;
        }

        if (videoElement.readyState < videoElement.HAVE_CURRENT_DATA || videoElement.videoWidth === 0) {
            document.querySelector('#loadingOverlay p').innerText = "Buffering Stream...";
            requestAnimationFrame(sendFrame);
            return;
        }

        // Send a frame only if we aren't waiting for the previous one 
        if (!framePending) {
            try {
                // document.querySelector('#loadingOverlay p').innerText = "Processing AI Frame...";
                hiddenCanvas.width = videoElement.videoWidth;
                hiddenCanvas.height = videoElement.videoHeight;
                hiddenCtx.drawImage(videoElement, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

                // Compress for real-time WebSocket transmission. LOWERED to 0.3 for ultimate speed
                const dataUrl = hiddenCanvas.toDataURL('image/jpeg', 0.3);
                ws.send(dataUrl);
                framePending = true;
            } catch (err) {
                document.querySelector('#loadingOverlay p').innerText = "Canvas Error: " + err.message;
                console.error("Canvas draw/send error", err);
            }
        }

        // Always loop
        requestAnimationFrame(sendFrame);
    };

    requestAnimationFrame(sendFrame);
}

function stopStreaming() {
    isStreaming = false;
    videoElement.pause();
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
    videoElement.srcObject = null;

    // Clear the loading overlay if it's there
    loadingOverlay.classList.add('hidden');
    videoControls.classList.add('hidden');

    // Draw stopped indicator on canvas
    setTimeout(() => {
        if (outputCanvas.width === 0) {
            outputCanvas.width = 640;
            outputCanvas.height = 480;
        }
        ctx.fillStyle = "#050505"; // Match dark theme bg
        ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "24px Inter";
        ctx.textAlign = "center";
        ctx.fillText("Camera Stopped", outputCanvas.width / 2, outputCanvas.height / 2);
        fpsCounter.innerText = "0";
    }, 100);
}

// Event Listeners
btnWebcam.addEventListener('click', async () => {
    if (isStreaming && videoElement.srcObject) {
        // Currently streaming webcam, so stop it
        stopStreaming();
        btnWebcam.innerText = "Start Webcam";
        btnWebcam.classList.remove('secondary');
        btnWebcam.classList.add('primary');
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(`control:clear_focus`);
        }
    } else {
        stopStreaming();
        try {
            // Lower webcam resolution constraints for faster JS to Python base64 transmission
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 480 }, height: { ideal: 360 }, facingMode: "user" }
            });
            videoElement.srcObject = stream;
            btnWebcam.innerText = "Stop Webcam";
            btnWebcam.classList.remove('primary');
            btnWebcam.classList.add('secondary');
            startStreaming();
        } catch (err) {
            console.error("Error accessing webcam:", err);
            alert("Could not access webcam.");
        }
    }
});

videoUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        stopStreaming();
        videoElement.srcObject = null;
        videoElement.src = URL.createObjectURL(file);

        // EXTREME SPEED FIX FOR UPLOADED VIDEOS: 
        // MP4s often run at 60 FPS natively, quickly overwhelming CPU WebSockets.
        // We artificially lower the HTML5 video playback rate to 0.5x when uploaded, 
        // to give the backend breathing room, resulting in a much smoother processed stream
        videoElement.playbackRate = 0.5;

        startStreaming();

        btnWebcam.innerText = "Start Webcam";
        btnWebcam.classList.remove('secondary');
        btnWebcam.classList.add('primary');

        // Show playback controls explicitly for uploaded videos
        videoControls.classList.remove('hidden');
        btnPlayPause.innerText = '⏸ Pause Video';
    }
});

btnPlayPause.addEventListener('click', () => {
    if (!videoElement.srcObject && videoElement.src) {
        // It's an uploaded video
        if (videoElement.paused) {
            videoElement.play();
            btnPlayPause.innerText = '⏸ Pause Video';
        } else {
            videoElement.pause();
            btnPlayPause.innerText = '▶ Play Video';
        }
    }
});

btnToggleBlur.addEventListener('click', () => {
    blurEnabled = !blurEnabled;
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(`control:toggle_blur`);
    }
});

btnClearFocus.addEventListener('click', () => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(`control:clear_focus`);
    }
});

btnScreenshot.addEventListener('click', () => {
    if (!isStreaming) {
        alert("Please start the video stream first!");
        return;
    }
    const dataUrl = outputCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `focus_screenshot_${new Date().getTime()}.png`;
    a.click();
});

btnRecord.addEventListener('click', () => {
    if (!isStreaming) {
        alert("Please start the video stream first!");
        return;
    }

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btnRecord.innerText = '🔴 Record Video';
        btnRecord.classList.remove('recording');
    } else {
        const stream = outputCanvas.captureStream(30); // 30 FPS recording
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
        recordedChunks = [];

        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `focus_recording_${new Date().getTime()}.webm`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
        };

        mediaRecorder.start();
        btnRecord.innerText = '⏹ Stop Recording';
        btnRecord.classList.add('recording');
    }
});

// Click to focus subject
outputCanvas.addEventListener('mousedown', async (e) => {
    if (!isStreaming || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) return;

    const rect = outputCanvas.getBoundingClientRect();
    const scaleX = outputCanvas.width / rect.width;
    const scaleY = outputCanvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    await fetch('/select_object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            x: x,
            y: y,
            width: outputCanvas.width,
            height: outputCanvas.height,
            client_id: clientId
        })
    });
});

// Initialize
connectWebSocket();

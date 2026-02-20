import cv2
import numpy as np
from ultralytics import YOLO

class VisionModels:
    """
    Singleton-like wrapper for loading AI models once at startup.
    Contains YOLOv8 Seg for detection, tracking, and segmentation.
    """
    
    def __init__(self):
        print("Loading YOLOv8 configuration...")
        self.yolo_model = YOLO("yolov8n.pt")
        
    def get_yolo(self):
        return self.yolo_model

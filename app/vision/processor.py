import cv2
import numpy as np
from app.vision.models import VisionModels

class VisionProcessor:
    def __init__(self):
        self.yolo = None
        
    def process_frame(self, frame, target_point=None, current_tracking_id=None, apply_blur=True):
        if self.yolo is None:
            import torch
            torch.set_num_threads(1) # Prevent OpenMP deadlocks on Windows
            models = VisionModels()
            self.yolo = models.get_yolo()
        
        # 1. Run inference with tracking
        try:
            # OPTIMIZATION: half=True enables FP16 precision, heavily speeding up CPU inference
            results = self.yolo.track(frame, persist=True, tracker="bytetrack.yaml", verbose=False, imgsz=320, half=True)
        except Exception as e:
            raise
            
        h, w, _ = frame.shape
        active_track_bbox = None
        new_tracking_id = current_tracking_id
        
        active_track_mask = None
        
        # 2. Extract bounding boxes and determine tracked item
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.int().cpu().numpy()
            masks = results[0].masks.data.cpu().numpy() if results[0].masks is not None else None
            
            # If a user clicked on the frame, assign the tracking ID containing that point
            if target_point is not None:
                pt_x, pt_y, pw, ph = target_point
                # Map relative coordinates back to original frame size
                real_x = pt_x * w / pw
                real_y = pt_y * h / ph
                
                # Find which box contains the point
                for box, t_id in zip(boxes, track_ids):
                    x1, y1, x2, y2 = box
                    if x1 <= real_x <= x2 and y1 <= real_y <= y2:
                        new_tracking_id = int(t_id)
                        break
            
            # Find the active bounding box based on current tracking ID
            if masks is not None:
                for idx, (box, t_id) in enumerate(zip(boxes, track_ids)):
                    if int(t_id) == new_tracking_id:
                        active_track_bbox = box
                        # masks are resized to original shape? data is (N, H, W)
                        # We must resize mask to frame dimensions
                        mask_raw = masks[idx]
                        active_track_mask = cv2.resize(mask_raw, (w, h), interpolation=cv2.INTER_LINEAR)
                        break
        
        output_frame = frame.copy()
            
        # Draw and mask using BOUNDING BOXES (Lightning fast)
        if new_tracking_id is not None and active_track_bbox is not None:
            x1, y1, x2, y2 = map(int, active_track_bbox)
            
            # Apply blur logic using bounding box inverse
            if apply_blur:
                # 1. Blur the entire frame (Optimized fast blur)
                small_frame = cv2.resize(frame, (w//4, h//4), interpolation=cv2.INTER_LINEAR)
                small_blurred = cv2.GaussianBlur(small_frame, (7, 7), 0)
                blurred_frame = cv2.resize(small_blurred, (w, h), interpolation=cv2.INTER_LINEAR)
                
                # 2. Extract the sharp subject from original frame
                subject_roi = frame[y1:y2, x1:x2]
                
                # 3. Paste the sharp subject back onto the blurred frame
                output_frame = blurred_frame.copy()
                output_frame[y1:y2, x1:x2] = subject_roi
            
            # Highlight subject
            cv2.rectangle(output_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(output_frame, f"Focus ID: {new_tracking_id}", (x1, max(y1-10, 0)), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                        
        else:
            # Just draw all detections in a light color if not tracked
            if apply_blur:
                # Optimized fast blur
                small_frame = cv2.resize(frame, (w//4, h//4), interpolation=cv2.INTER_LINEAR)
                small_blurred = cv2.GaussianBlur(small_frame, (7, 7), 0)
                output_frame = cv2.resize(small_blurred, (w, h), interpolation=cv2.INTER_LINEAR)
            if results[0].boxes is not None and results[0].boxes.id is not None:
                 boxes = results[0].boxes.xyxy.cpu().numpy()
                 for box in boxes:
                     x1, y1, x2, y2 = map(int, box)
                     cv2.rectangle(output_frame, (x1, y1), (x2, y2), (100, 100, 100), 1)
                     
        detected_count = 0
        tracked_class = "None"
        if results[0].boxes is not None:
            detected_count = len(results[0].boxes)
            if new_tracking_id is not None and results[0].boxes.id is not None:
                track_ids_arr = results[0].boxes.id.int().cpu().numpy()
                cls_ids_arr = results[0].boxes.cls.int().cpu().numpy()
                for t_id, c_id in zip(track_ids_arr, cls_ids_arr):
                    if int(t_id) == new_tracking_id:
                        tracked_class = self.yolo.names[int(c_id)]
                        break

        return output_frame, new_tracking_id, detected_count, tracked_class

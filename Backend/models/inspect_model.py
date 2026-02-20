"""
Run this script on your machine to find the exact input shape your CNN expects.
Usage:  python inspect_model.py
"""
import tensorflow as tf

MODEL_PATH = r"F:\projects\DSP\Viewer\Backend\models\eeg_model_final.keras"

model = tf.keras.models.load_model(MODEL_PATH)

print("\n" + "="*60)
print("  FULL MODEL SUMMARY")
print("="*60)
model.summary()

print("\n" + "="*60)
print("  LAYER-BY-LAYER SHAPES")
print("="*60)
for i, layer in enumerate(model.layers):
    try:
        print(f"  [{i:02d}] {layer.__class__.__name__:20s}  "
              f"in={str(layer.input_shape):35s}  "
              f"out={str(layer.output_shape)}")
    except Exception:
        print(f"  [{i:02d}] {layer.__class__.__name__:20s}  (shape unavailable)")

# The answer we need
first_input = model.layers[0].input_shape
print("\n" + "="*60)
print(f"  ✅ MODEL EXPECTS INPUT SHAPE: {first_input}")
print(f"     → WINDOW_SIZE = {first_input[1]}")
print(f"     → N_CHANNELS  = {first_input[2]}")
print("="*60)

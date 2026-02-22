"""
Run this script on your machine to find the exact input shape your CNN expects.
Usage:  python inspect_model.py
"""
import os
import tensorflow as tf

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eeg_model.keras")

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
        in_shape = getattr(layer, 'input_shape', getattr(layer, 'output_shape', None))
        print(f"  [{i:02d}] {layer.__class__.__name__:20s}  "
              f"in={str(in_shape):35s}  "
              f"out={str(layer.output_shape)}")
    except Exception:
        print(f"  [{i:02d}] {layer.__class__.__name__:20s}  (shape unavailable)")

# The answer we need
first_input = getattr(model.layers[0], 'output_shape', getattr(model.layers[0], 'batch_shape', None))
if isinstance(first_input, list):
    first_input = first_input[0]
print("\n" + "="*60)
print(f"  ✅ MODEL EXPECTS INPUT SHAPE: {first_input}")
print(f"     → WINDOW_SIZE = {first_input[1]}")
print(f"     → N_CHANNELS  = {first_input[2]}")
print("="*60)

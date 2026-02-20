import matplotlib.pyplot as plt
import os, sys
sys.path.insert(0, '.')
from core.doppler_math import simulate_doppler_pass

res = simulate_doppler_pass(f_source=440.0, v_car_kmh=80.0, sr=44100, duration=6.0)

t = res['time_freq']
f = res['freq_over_time']

# Write graph to a text file for ascii plotting or just find max/min
print(f"Max Freq: {max(f):.2f}")
print(f"Min Freq: {min(f):.2f}")
print(f"Start Freq: {f[0]:.2f}")
print(f"End Freq: {f[-1]:.2f}")
print(f"Mid Freq (at t={t[len(t)//2]:.2f}): {f[len(f)//2]:.2f}")

# Ascii plot
def plot_ascii(t, f, width=60, height=20):
    min_f, max_f = min(f), max(f)
    print("ASCII PLOT:")
    for row in range(height, -1, -1):
        target_f = min_f + (max_f - min_f) * (row / height)
        line = ""
        for i in range(width):
            idx = int((i / width) * len(t))
            if idx >= len(f): idx = len(f) - 1
            if abs(f[idx] - target_f) < ((max_f - min_f) / height):
                line += "*"
            else:
                line += " "
        print(f"{target_f:6.1f} | {line}")

plot_ascii(t, f)

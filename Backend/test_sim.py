import os, sys, json
sys.path.insert(0, '.')
from core.doppler_math import simulate_doppler_pass

res = simulate_doppler_pass(f_source=440.0, v_car_kmh=80.0, sr=44100, duration=6.0)
out = {
    'time_freq': res['time_freq'][:10] + res['time_freq'][-10:],
    'freq_over_time': res['freq_over_time'][:10] + res['freq_over_time'][-10:]
}
print(json.dumps(out, indent=2))

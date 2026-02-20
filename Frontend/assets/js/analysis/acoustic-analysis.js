// Acoustic Analysis Logic
// Frontend rendering functions for acoustic domain charts

/**
 * Render a waveform plot
 */
export function renderWaveform(containerId, timeData, amplitudeData, title = 'Waveform') {
    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(13,19,39,0.5)',
        font: { color: '#7a8bb5', family: 'Inter', size: 11 },
        margin: { t: 25, b: 40, l: 55, r: 20 },
        title: { text: title, font: { size: 13 } },
        xaxis: { title: 'Time (s)', gridcolor: 'rgba(99,140,255,0.06)' },
        yaxis: { title: 'Amplitude', gridcolor: 'rgba(99,140,255,0.06)' },
    };

    Plotly.newPlot(containerId, [{
        x: timeData,
        y: amplitudeData,
        mode: 'lines',
        line: { color: '#638cff', width: 1.2 },
    }], layout, { displayModeBar: false, responsive: true });
}

/**
 * Render an FFT magnitude plot
 */
export function renderFFT(containerId, frequencies, magnitudes, maxFreq = 5000) {
    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(13,19,39,0.5)',
        font: { color: '#7a8bb5', family: 'Inter', size: 11 },
        margin: { t: 10, b: 40, l: 55, r: 20 },
        xaxis: { title: 'Frequency (Hz)', gridcolor: 'rgba(99,140,255,0.06)', range: [0, maxFreq] },
        yaxis: { title: 'Magnitude', gridcolor: 'rgba(99,140,255,0.06)' },
    };

    Plotly.newPlot(containerId, [{
        x: frequencies,
        y: magnitudes,
        mode: 'lines',
        line: { color: '#a78bfa', width: 1.2 },
        fill: 'tozeroy',
        fillcolor: 'rgba(167,139,250,0.1)',
    }], layout, { displayModeBar: false, responsive: true });
}

/**
 * Render a spectrogram heatmap
 */
export function renderSpectrogram(containerId, times, frequencies, power, maxFreq = 3000) {
    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(13,19,39,0.5)',
        font: { color: '#7a8bb5', family: 'Inter', size: 11 },
        margin: { t: 10, b: 40, l: 55, r: 20 },
        xaxis: { title: 'Time (s)', gridcolor: 'rgba(99,140,255,0.06)' },
        yaxis: { title: 'Frequency (Hz)', gridcolor: 'rgba(99,140,255,0.06)', range: [0, maxFreq] },
    };

    Plotly.newPlot(containerId, [{
        x: times,
        y: frequencies,
        z: power,
        type: 'heatmap',
        colorscale: [
            [0, '#0a0e1a'], [0.2, '#1a1145'], [0.4, '#3b1f8e'],
            [0.6, '#638cff'], [0.8, '#34d399'], [1, '#fbbf24']
        ],
        showscale: true,
    }], layout, { displayModeBar: false, responsive: true });
}

console.log("Acoustic Analysis Module Loaded");

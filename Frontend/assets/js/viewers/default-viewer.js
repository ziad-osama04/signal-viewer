// Frontend/assets/js/viewers/default-viewer.js

/**
 * Renders multiple synchronized charts for multi-channel signals.
 * @param {string} containerId - The ID of the HTML element to hold the charts.
 * @param {object} data - The data object returned from the backend.
 */
export function renderMultiChannelViewer(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear previous charts
    container.innerHTML = "";
    
    const signals = data.signals; // Dictionary of channel_name: [values]
    const time = data.time;       // Array of time values
    const channelNames = Object.keys(signals);
    
    // Store graph DOM elements to link them later
    let graphDivs = [];

    // Loop through each channel and create a chart
    channelNames.forEach((channel, index) => {
        // 1. Create a container div for this specific channel
        const div = document.createElement("div");
        div.id = `chart-${index}`;
        div.style.height = "200px"; // Fixed height per channel
        div.style.marginBottom = "15px";
        div.style.border = "1px solid #eee";
        container.appendChild(div);
        
        graphDivs.push(div);

        // 2. Define the data trace
        const trace = {
            x: time,
            y: signals[channel],
            mode: 'lines',
            name: channel,
            line: { 
                color: index % 2 === 0 ? '#1f77b4' : '#d62728', // Alternate colors
                width: 1.5 
            }
        };

        // 3. Define layout
        const layout = {
            title: { text: channel, font: { size: 14 }, x: 0.01 },
            margin: { t: 30, b: 30, l: 50, r: 20 },
            showlegend: false,
            // Only show X-axis labels on the very bottom graph
            xaxis: { 
                showticklabels: index === channelNames.length - 1,
                gridcolor: '#f0f0f0'
            },
            yaxis: { 
                fixedrange: true, // Lock Y-axis (vertical zoom disabled)
                gridcolor: '#f0f0f0'
            }
        };

        // 4. Render the plot
        Plotly.newPlot(div, [trace], layout, { displayModeBar: false, responsive: true });
    });

    // === SYNCHRONIZATION LOGIC (Master-Slave) ===
    // This makes all graphs zoom/pan together
    graphDivs.forEach(div => {
        div.on('plotly_relayout', (event) => {
            // Check if the event is a zoom/pan on the X-axis
            if (event['xaxis.range[0]'] || event['xaxis.autorange']) {
                
                // Prepare the update object
                const update = event['xaxis.autorange'] 
                    ? { 'xaxis.autorange': true } 
                    : { 
                        'xaxis.range[0]': event['xaxis.range[0]'], 
                        'xaxis.range[1]': event['xaxis.range[1]'] 
                      };

                // Apply this update to all OTHER graphs
                graphDivs.forEach(otherDiv => {
                    if (otherDiv !== div) {
                        // Plotly.relayout is efficient and doesn't redraw the whole graph
                        Plotly.relayout(otherDiv, update);
                    }
                });
            }
        });
    });
}
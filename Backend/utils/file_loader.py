import pandas as pd

def load_csv(file_path):
    try:
        # Read CSV
        df = pd.read_csv(file_path)
        
        # Assume 1st column is Time, rest are Signals
        time_col = df.columns[0]
        signal_cols = df.columns[1:].tolist()
        
        # Replace NaNs with 0 to prevent JSON errors
        df = df.fillna(0)
        
        return df, time_col, signal_cols
    except Exception as e:
        raise ValueError(f"Failed to load file: {str(e)}")
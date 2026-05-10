# finance_agent/tools/chart.py
import base64
from io import BytesIO
from typing import List
import matplotlib
matplotlib.use("Agg")  # Dùng backend không cần GUI
import matplotlib.pyplot as plt

def generate_price_chart(values: List[float], labels: List[str] | None = None) -> str:
    """
    Generate a PNG chart and return base64 string.
    """
    if not values:
        raise ValueError("values required")
    plt.figure(figsize=(6,3))
    plt.plot(values)
    if labels:
        plt.xticks(range(len(labels)), labels, rotation=30)
    plt.tight_layout()
    buf = BytesIO()
    plt.savefig(buf, format="png")
    plt.close()
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")

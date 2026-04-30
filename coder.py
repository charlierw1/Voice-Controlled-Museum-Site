import sys
from collections import Counter

if len(sys.argv) < 2:
    print("Usage: python coder.py <file.txt>")
    sys.exit(1)

lines = []
with open(sys.argv[1], "r", encoding="utf-8") as f:
    for line in f:
        stripped = line.strip()
        if stripped:
            lines.append(stripped)

counts = Counter(lines)
for value, count in counts.most_common():
    print(f"{count}x  {value}")

import re

task_lines = {1: [], 2: [], 3: []}
current_task = 1  # default to task 1 when a new user begins

with open("think-aloud-2.txt", "r", encoding="utf-8") as f:
    for line in f:
        stripped = line.strip()

        if not stripped:
            continue

        # "User N:" header — reset to task 1 for the new user
        if re.match(r'^user\s+\d+\s*:', stripped, re.IGNORECASE):
            current_task = 1
            continue

        # Task header like "Task 1:", "Task1:", "task 2: ..."
        task_match = re.match(r'^task\s*([123])\b', stripped, re.IGNORECASE)
        if task_match:
            current_task = int(task_match.group(1))
            continue

        # Skip parenthetical researcher notes e.g. "(didn't pick up)"
        if stripped.startswith('(') and stripped.endswith(')'):
            continue

        # Normalise: lowercase and strip
        normalised = stripped.lower()
        task_lines[current_task].append(normalised)

for task_num in [1, 2, 3]:
    with open(f"task{task_num}.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(task_lines[task_num]) + "\n")

    print(f"task{task_num}.txt — {len(task_lines[task_num])} lines")

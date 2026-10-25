import os

def fix_enum():
    file_path = 'backend/api/routes/converge.py'
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()

    text = text.replace('execution_mode=req.execution_mode or "ANALYSIS"', 'execution_mode=req.execution_mode or "analysis"')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    fix_enum()
    print("Enum fixed.")

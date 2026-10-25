from backend.core.database import SessionLocal, GenerationTask, init_db

def main():
    init_db()
    db = SessionLocal()
    tasks = db.query(GenerationTask).order_by(GenerationTask.created_at.desc()).limit(1).all()
    if tasks:
        task = tasks[0]
        print(f'Task ID: {task.task_id}')
        print(f'Status: {task.status}')
        if task.logs:
            print(f'Logs ({len(task.logs)}):')
            for log in task.logs[-10:]:
                print(f'[{log.get("timestamp", "")}] {log.get("agent", "")}: {log.get("message", "")}')
        else:
            print('No logs found.')
        
        if task.partial_state:
            print("Partial State Keys:", list(task.partial_state.keys()))
            if "error" in task.partial_state:
                print("ERROR in State:", task.partial_state["error"])
    else:
        print('No tasks found.')

if __name__ == "__main__":
    main()

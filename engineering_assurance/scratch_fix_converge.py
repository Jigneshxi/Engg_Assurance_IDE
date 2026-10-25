import os

def fix_converge_dto():
    file_path = 'backend/api/routes/converge.py'
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Add fields to ConvergeMissionRequest
    old_dto = """class ConvergeMissionRequest(BaseModel):
    sources: List[Any] = []
    context: str = ""
    active_agents: Optional[Dict[str, Any]] = None
    modules: Optional[List[str]] = None
    depth: str = "standard"
    module: str = "all"
    role: str = "qa_engineer"
    min_log_level: Optional[int] = 3
    parent_task_id: Optional[str] = None
    use_node_cache: Optional[bool] = None
    mission_name: Optional[str] = None"""
    
    new_dto = """class ConvergeMissionRequest(BaseModel):
    sources: List[Any] = []
    context: str = ""
    active_agents: Optional[Dict[str, Any]] = None
    modules: Optional[List[str]] = None
    depth: str = "standard"
    module: str = "all"
    role: str = "qa_engineer"
    min_log_level: Optional[int] = 3
    parent_task_id: Optional[str] = None
    use_node_cache: Optional[bool] = None
    mission_name: Optional[str] = None
    execution_context: Optional[Dict[str, Any]] = None
    execution_mode: Optional[str] = None"""
    
    text = text.replace(old_dto, new_dto)

    # 2. Update all GenerateRequest instantiations in converge.py
    # There are four of them: ingest, forge, certify, decide, mission
    
    old_gen_req = """    gen_req = GenerateRequest(sources=req.sources, context=req.context, active_agents=active_agents,
                              min_log_level=req.min_log_level, parent_task_id=req.parent_task_id,
                              depth=req.depth, role=req.role, use_node_cache=req.use_node_cache, module=req.module, mission_name=req.mission_name)"""
    new_gen_req = """    gen_req = GenerateRequest(sources=req.sources, context=req.context, active_agents=active_agents,
                              min_log_level=req.min_log_level, parent_task_id=req.parent_task_id,
                              depth=req.depth, role=req.role, use_node_cache=req.use_node_cache, module=req.module, mission_name=req.mission_name,
                              execution_context=req.execution_context, execution_mode=req.execution_mode or "ANALYSIS")"""
    
    text = text.replace(old_gen_req, new_gen_req)

    old_gen_req_mission = """    gen_req = GenerateRequest(
        sources=req.sources,
        context=req.context,
        active_agents=active_agents,
        min_log_level=req.min_log_level,
        parent_task_id=req.parent_task_id,
        depth=req.depth,
        role=req.role,
        use_node_cache=req.use_node_cache,
        module=req.module,
        mission_name=req.mission_name
    )"""
    new_gen_req_mission = """    gen_req = GenerateRequest(
        sources=req.sources,
        context=req.context,
        active_agents=active_agents,
        min_log_level=req.min_log_level,
        parent_task_id=req.parent_task_id,
        depth=req.depth,
        role=req.role,
        use_node_cache=req.use_node_cache,
        module=req.module,
        mission_name=req.mission_name,
        execution_context=req.execution_context,
        execution_mode=req.execution_mode or "ANALYSIS"
    )"""

    text = text.replace(old_gen_req_mission, new_gen_req_mission)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == '__main__':
    fix_converge_dto()
    print("Converge DTO fixed.")

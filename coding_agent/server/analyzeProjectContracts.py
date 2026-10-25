"""Parse generated Python without importing it or accessing a database/configuration."""
import ast
import json
import sys


def analyze(files):
    trees, defects, classes, exports, routers, includes = {}, [], {}, {}, {}, []
    declarative_bases = set()

    def defect(code, file, line, message, target_file=None):
        item = dict(code=code, file=file, line=line, message=message, severity="HIGH")
        if target_file:
            item["targetFile"] = target_file
        key = (code, file, line, message)
        if not any((d["code"], d["file"], d["line"], d["message"]) == key for d in defects):
            defects.append(item)

    files = {k.replace("\\", "/"): v for k, v in files.items()}
    for file, content in files.items():
        if not file.endswith(".py"):
            continue
        try:
            trees[file] = ast.parse(content, filename=file)
        except Exception as error:
            defect("PYTHON_SYNTAX_ERROR", file, getattr(error, 'lineno', 1), str(error))
    def collect_exports(file, nodes):
        for node in nodes:
            if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                exports[file].add(node.name)
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                exports[file].update(alias.asname or alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, (ast.Assign, ast.AnnAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                exports[file].update(t.id for t in targets if isinstance(t, ast.Name))
            elif isinstance(node, ast.If):
                collect_exports(file, node.body)
                collect_exports(file, node.orelse)
            elif isinstance(node, (ast.Try, getattr(ast, "TryStar", ast.Try))):
                collect_exports(file, node.body)
                collect_exports(file, node.orelse)
                collect_exports(file, node.finalbody)
                for handler in node.handlers:
                    collect_exports(file, handler.body)
            elif isinstance(node, (ast.With, ast.AsyncWith)):
                collect_exports(file, node.body)

    def scan_definition_scope(file, nodes, scope_name="module", seen=None):
        seen = set() if seen is None else seen
        for node in nodes:
            if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                is_prop_accessor = isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and any(
                    (isinstance(d, ast.Attribute) and d.attr in ("setter", "deleter")) for d in getattr(node, "decorator_list", [])
                )
                if node.name in seen and not is_prop_accessor:
                    defect("DUPLICATE_DEFINITION", file, node.lineno, f"Repeated definition in {scope_name}: {node.name}")
                seen.add(node.name)
                scan_definition_scope(file, node.body, scope_name + "." + node.name)
            elif isinstance(node, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.With, ast.AsyncWith)):
                scan_definition_scope(file, node.body, scope_name, seen)
                scan_definition_scope(file, getattr(node, "orelse", []), scope_name, seen)
            elif isinstance(node, (ast.Try, getattr(ast, "TryStar", ast.Try))):
                scan_definition_scope(file, node.body, scope_name, seen)
                scan_definition_scope(file, node.orelse, scope_name, seen)
                scan_definition_scope(file, node.finalbody, scope_name, seen)
                for handler in node.handlers:
                    scan_definition_scope(file, handler.body, scope_name, seen)

    for file, tree in trees.items():
        exports[file] = set()
        scan_definition_scope(file, tree.body)
        for node in tree.body:
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                factory = getattr(node.value.func, "id", getattr(node.value.func, "attr", ""))
                if factory in ("declarative_base", "DeclarativeBase"):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            declarative_bases.add((file, target.id))
            if isinstance(node, ast.AnnAssign) and isinstance(node.value, ast.Call):
                factory = getattr(node.value.func, "id", getattr(node.value.func, "attr", ""))
                if factory in ("declarative_base", "DeclarativeBase") and isinstance(node.target, ast.Name):
                    declarative_bases.add((file, node.target.id))
        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                fields, required = set(), set()
                allows_extra = False
                for child in node.body:
                    if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name):
                        fields.add(child.target.id)
                        value = child.value
                        if value is None or (isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == "Field" and ((value.args and isinstance(value.args[0], ast.Constant) and value.args[0].value is Ellipsis) or (not value.args and not any(k.arg in ("default", "default_factory") for k in value.keywords)))):
                            required.add(child.target.id)
                    elif isinstance(child, ast.Assign):
                        for t in child.targets:
                            if isinstance(t, ast.Name):
                                if t.id != "__tablename__":
                                    fields.add(t.id)
                                if t.id == "model_config" and isinstance(child.value, ast.Call):
                                    for kw in child.value.keywords:
                                        if kw.arg == "extra" and isinstance(kw.value, ast.Constant) and kw.value.value in ("allow", "ignore"):
                                            allows_extra = True
                    elif isinstance(child, ast.ClassDef) and child.name == "Config":
                        for cc in child.body:
                            if isinstance(cc, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "extra" for t in cc.targets):
                                if isinstance(cc.value, ast.Constant) and cc.value.value in ("allow", "ignore"):
                                    allows_extra = True
                classes[(file, node.name)] = dict(fields=fields, required=required, bases=[b.id for b in node.bases if isinstance(b, ast.Name)], allows_extra=allows_extra)
        collect_exports(file, tree.body)

    def resolve_module(source, module, level=0):
        base = source.rsplit("/", 1)[0] if level else ""
        if level:
            for _ in range(level - 1):
                base = base.rsplit("/", 1)[0]
        prefixes = [base + "/"] if level else ["", "backend/"]
        for prefix in prefixes:
            candidate = prefix + (module or "").replace(".", "/")
            for target in [candidate + ".py", candidate + "/__init__.py"]:
                if target in files:
                    return target
            if any(f.startswith(candidate + "/") for f in files):
                return candidate + "/__init__.py"
        if module and (module == "app.models" or module.startswith("app.models.")) and ("test" in source):
            for candidate in ["backend/app/db/models.py", "app/db/models.py"]:
                if candidate in files:
                    return candidate
        return None

    def matches_export(target, symbol):
        target_set = exports.get(target, set())
        if symbol in target_set or "*" in target_set:
            return True
        return False

    imports = {}
    for file, tree in trees.items():
        imports[file] = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if not alias.name.startswith(("app.", "backend.")):
                        continue
                    target = resolve_module(file, alias.name)
                    if target is None:
                        defect("MISSING_PYTHON_MODULE", file, node.lineno, "Missing module: " + alias.name)
                    else:
                        local_name = alias.asname or alias.name.split(".")[0]
                        imports[file][local_name] = (target, "")
            if isinstance(node, ast.ImportFrom) and (node.level or (node.module or "").startswith(("app", "backend"))):
                target = resolve_module(file, node.module, node.level)
                if target is None:
                    defect("MISSING_PYTHON_MODULE", file, node.lineno, "Missing module: " + str(node.module), "backend/" + node.module.replace(".", "/") + ".py" if node.module and node.module.startswith("app.") else None)
                    continue
                for alias in node.names:
                    submodule_name = ((node.module + ".") if node.module else "") + alias.name
                    submodule = resolve_module(file, submodule_name, node.level)
                    if submodule:
                        imports[file][alias.asname or alias.name] = (submodule, "")
                        continue
                    imports[file][alias.asname or alias.name] = (target, alias.name)
                    if alias.name != "*" and not matches_export(target, alias.name) and submodule is None:
                        defect("MISSING_PYTHON_SYMBOL", file, node.lineno, "Missing export " + alias.name + " from " + str(node.module), target if target in files else None)
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == "APIRouter":
                prefix = next((k.value.value for k in node.value.keywords if k.arg == "prefix" and isinstance(k.value, ast.Constant)), "")
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        routers[(file, target.id)] = prefix
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "include_router" and node.args and isinstance(node.args[0], ast.Name):
                target = imports[file].get(node.args[0].id)
                prefix = next((k.value.value for k in node.keywords if k.arg == "prefix" and isinstance(k.value, ast.Constant)), "")
                if target:
                    includes.append((target, prefix, file, node.func.value.id if isinstance(node.func.value, ast.Name) else ""))

    def schema(file, name, seen=None):
        seen = set() if seen is None else seen
        if (file, name) in seen:
            return None
        seen.add((file, name))
        if name in imports.get(file, {}):
            return schema(*imports[file][name], seen)
        for imp_target, imp_name in imports.get(file, {}).values():
            if imp_name == "*":
                res = schema(imp_target, name, seen)
                if res:
                    return res
        data = classes.get((file, name))
        if not data:
            return None
        result = {"fields": set(data["fields"]), "required": set(data["required"]), "allows_extra": data.get("allows_extra", False), "is_schema": "BaseModel" in data["bases"] or "/schemas/" in file, "is_orm": is_orm_class(file, name)}
        for base in data["bases"]:
            inherited = schema(file, base, seen.copy())
            if inherited:
                result["fields"].update(inherited["fields"])
                result["required"].update(inherited["required"] - data["fields"])
                if inherited.get("allows_extra"):
                    result["allows_extra"] = True
        return result

    def is_orm_class(file, name, seen=None):
        seen = set() if seen is None else seen
        key = (file, name)
        if key in seen:
            return False
        if key in declarative_bases:
            return True
        seen.add(key)
        data = classes.get(key)
        if not data or "BaseModel" in data["bases"]:
            return False
        for base in data["bases"]:
            if base in ("DeclarativeBase", "Model"):
                return True
            imported = imports.get(file, {}).get(base)
            if imported and is_orm_class(imported[0], imported[1], seen.copy()):
                return True
            if is_orm_class(file, base, seen.copy()):
                return True
        return False

    def prefixes(key, seen=None):
        seen = set() if seen is None else seen
        if key in seen:
            return []
        seen.add(key)
        matches = [(prefix, parent, receiver) for target, prefix, parent, receiver in includes if target == key]
        if not matches:
            return [routers.get(key, "")]
        result = []
        for prefix, parent, receiver in matches:
            parent_prefixes = prefixes((parent, receiver), seen.copy())
            result.extend(p + prefix + routers.get(key, "") for p in parent_prefixes)
        return result

    ignored_attrs = {
        "dict", "model_dump", "json", "model_dump_json", "copy", "model_copy", "model_validate",
        "from_orm", "parse_obj", "construct", "schema", "schema_json",
        "filter", "filter_by", "count", "offset", "limit", "all", "first", "one", "scalar",
        "order_by", "join", "outerjoin", "group_by", "having", "distinct", "options",
        "values", "value", "yield_per", "populate_existing", "statement", "subquery", "exists", "items",
        "append", "extend", "insert", "remove", "pop", "clear", "index", "sort", "reverse",
        "get", "keys", "update", "setdefault", "popitem", "add", "discard", "password",
        "__table__", "__tablename__", "__mapper__", "metadata", "columns", "c",
    }

    def class_info(file, expr):
        if isinstance(expr, ast.Name):
            return schema(file, expr.id)
        if isinstance(expr, ast.Attribute) and isinstance(expr.value, ast.Name):
            imported = imports.get(file, {}).get(expr.value.id)
            if imported:
                target, name = imported
                if name:
                    module_file = target[:-12] + name + ".py" if target.endswith("__init__.py") else target
                    return schema(module_file, expr.attr)
                return schema(target, expr.attr)
        return None

    def literal_value(node):
        try:
            ast.literal_eval(node)
            return True
        except (ValueError, TypeError):
            return False

    for file, tree in trees.items():
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr == "query" and node.args:
                    arg = node.args[0]
                    data = class_info(file, arg)
                    name = arg.id if isinstance(arg, ast.Name) else getattr(arg, "attr", "")
                    imported = imports.get(file, {}).get(name)
                    class_file, class_name = imported or (file, name)
                    if data and data.get("is_schema"):
                        defect("ORM_SCHEMA_QUERY", file, node.lineno, "Query uses Pydantic schema " + name + " instead of a persistent ORM model")
                    elif not data or not data.get("is_orm"):
                        defect("ORM_MODEL_UNRESOLVED", file, node.lineno, "db.query target does not resolve to a declared ORM model: " + name)
                if node.func.attr == "includes" and isinstance(node.func.value, ast.Constant) and isinstance(node.func.value.value, str):
                    defect("INVALID_PYTHON_API", file, node.lineno, "Python strings have no includes method; use membership testing")
                data = class_info(file, node.func.value)
                if data and node.func.attr not in data["fields"] and node.func.attr not in ignored_attrs:
                    if not data.get("allows_extra"):
                        defect("MODEL_FIELD_MISMATCH", file, node.lineno, "Class attribute is absent from declared model: " + ast.unparse(node.func))
            if isinstance(node, ast.Attribute):
                data = class_info(file, node.value)
                if data and node.attr not in data["fields"] and node.attr not in ignored_attrs:
                    if not data.get("allows_extra"):
                        defect("MODEL_FIELD_MISMATCH", file, node.lineno, "Class attribute is absent from declared model: " + ast.unparse(node))
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            routes_here = [d for d in node.decorator_list if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr in ("get", "post", "put", "patch", "delete")]
            if not routes_here:
                continue
            public_health = all(d.args and isinstance(d.args[0], ast.Constant) and str(d.args[0].value).rstrip("/").split("/")[-1] in ("health", "ping") for d in routes_here)
            body = [n for n in node.body if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str))]
            constant_handler = len(body) == 1 and isinstance(body[0], ast.Return) and literal_value(body[0].value)
            if not public_health and (constant_handler or node.name.startswith(("auto_bridge_", "bridge_", "fe_")) or node.args.vararg or node.args.kwarg):
                defect("STUB_ENDPOINT", file, node.lineno, "Endpoint must implement real behavior with explicit parameters: " + node.name)
            commits = [n for n in ast.walk(node) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "commit"]
            if len(commits) > 1 and any(isinstance(n, (ast.For, ast.While)) for n in ast.walk(node)):
                defect("NON_ATOMIC_WORKFLOW", file, node.lineno, "Workflow commits repeatedly inside a multi-record operation; use one atomic transaction")

    # 1. Check for missing typing imports
    typing_symbols = {"Any", "List", "Optional", "Dict", "Union", "Tuple", "Callable", "Set", "Sequence", "Mapping"}
    typing_imports = {}
    for file, tree in trees.items():
        typing_imports[file] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "typing":
                for alias in node.names:
                    typing_imports[file].add(alias.asname or alias.name)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "typing":
                        typing_imports[file].add("typing")
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id in typing_symbols:
                if node.id not in typing_imports[file] and "typing" not in typing_imports[file] and node.id not in exports.get(file, set()):
                    defect("MISSING_TYPING_IMPORT", file, node.lineno, f"Symbol '{node.id}' is used but not imported from typing")

    # 2. Check for hardcoded placeholder authentication tokens
    placeholder_tokens = ("YOUR_ACCESS_TOKEN", "YOUR_TOKEN", "dummy_token", "mock_token", "test-token", "fake-token", "fake_token", "test_token")
    for file, tree in trees.items():
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                val = node.value.strip()
                val_lower = val.lower()
                is_placeholder = val in placeholder_tokens or any(p in val for p in ("YOUR_ACCESS_TOKEN", "test-token", "fake-token", "YOUR_TOKEN"))
                if is_placeholder:
                    if "/tests/" not in file or "access_token" in val_lower or val == "YOUR_ACCESS_TOKEN":
                        defect("HARDCODED_AUTH_TOKEN", file, node.lineno, f"Hardcoded placeholder authentication token is not permitted: {node.value}")

    # 3. Check for unflushed parent model instances
    for file, tree in trees.items():
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                added_vars = set()
                flushed_vars = set()
                for stmt in node.body:
                    for call in ast.walk(stmt):
                        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "add":
                            if call.args and isinstance(call.args[0], ast.Name):
                                added_vars.add(call.args[0].id)
                        elif isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr in ("flush", "commit"):
                            flushed_vars.update(added_vars)
                    for sub in ast.walk(stmt):
                        if isinstance(sub, ast.Attribute) and sub.attr == "id" and isinstance(sub.value, ast.Name):
                            if sub.value.id in added_vars and sub.value.id not in flushed_vars:
                                defect("UNFLUSHED_PARENT_ID", file, sub.lineno, f"Parent model instance '{sub.value.id}' must be flushed with db.flush() before accessing '{sub.value.id}.id'")

    # 4. Check for user object vs dictionary access mismatch
    current_user_returns_dict = False
    current_user_returns_object = False
    for f, t in trees.items():
        for n in ast.walk(t):
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == "get_current_user":
                for ret in ast.walk(n):
                    if isinstance(ret, ast.Return):
                        if isinstance(ret.value, ast.Dict):
                            current_user_returns_dict = True
                        elif isinstance(ret.value, ast.Call) and isinstance(ret.value.func, ast.Name) and ret.value.func.id in ("CurrentUser", "User", "UserModel"):
                            current_user_returns_object = True
    if current_user_returns_dict:
        dict_methods = {"get", "keys", "values", "items", "pop", "clear", "copy", "update", "setdefault"}
        for f, t in trees.items():
            for n in ast.walk(t):
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    has_user_param = any(a.arg == "current_user" for a in n.args.args)
                    if has_user_param:
                        for sub in ast.walk(n):
                            if isinstance(sub, ast.Attribute) and isinstance(sub.value, ast.Name) and sub.value.id == "current_user":
                                if sub.attr not in dict_methods:
                                    defect("USER_OBJECT_DICT_MISMATCH", f, sub.lineno, f"current_user is provided as a dictionary but accessed with object attribute notation '{sub.value.id}.{sub.attr}'")
    if current_user_returns_object:
        for f, t in trees.items():
            for n in ast.walk(t):
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    has_user_param = any(a.arg == "current_user" for a in n.args.args)
                    if has_user_param:
                        for sub in ast.walk(n):
                            if isinstance(sub, ast.Subscript) and isinstance(sub.value, ast.Name) and sub.value.id == "current_user":
                                defect("USER_OBJECT_DICT_MISMATCH", f, sub.lineno, "current_user is provided as an object but accessed with dictionary subscript notation")
                            elif isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute) and isinstance(sub.func.value, ast.Name) and sub.func.value.id == "current_user" and sub.func.attr == "get":
                                defect("USER_OBJECT_DICT_MISMATCH", f, sub.lineno, "current_user is provided as an object but accessed with dict .get() method")

    # 5. Check for cart logic misusing OrderItem.order_id as user identifier
    for file, tree in trees.items():
        if "cart" in file:
            for sub in ast.walk(tree):
                if isinstance(sub, ast.Attribute) and sub.attr == "order_id" and isinstance(sub.value, ast.Name) and sub.value.id == "OrderItem":
                    defect("CART_ORDER_MODEL_MISUSE", file, sub.lineno, "Cart logic cannot reuse OrderItem with order_id set to user_id")
                elif isinstance(sub, ast.keyword) and sub.arg == "order_id" and isinstance(sub.value, ast.Attribute) and sub.value.attr == "id" and isinstance(sub.value.value, ast.Name) and "user" in sub.value.value.id.lower():
                    defect("CART_ORDER_MODEL_MISUSE", file, sub.lineno, "Cart logic cannot set OrderItem.order_id to user_id")
                elif isinstance(sub, ast.Call) and getattr(sub.func, "id", "") == "OrderItem":
                    if any(kw.arg == "order_id" for kw in sub.keywords):
                        defect("CART_ORDER_MODEL_MISUSE", file, sub.lineno, "Cart logic cannot instantiate OrderItem with order_id; use CartItem model")

    for file, tree in trees.items():
        if "/tests/" not in file:
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith('test_'):
                is_fixture = any(
                    (isinstance(d, ast.Name) and d.id in ('fixture', 'pytest_fixture')) or
                    (isinstance(d, ast.Attribute) and d.attr == 'fixture') or
                    (isinstance(d, ast.Call) and getattr(d.func, 'id', getattr(d.func, 'attr', '')) == 'fixture')
                    for d in node.decorator_list
                )
                if is_fixture:
                    continue
                assertions = [a for a in ast.walk(node) if isinstance(a, ast.Assert)]
                meaningful = any(any(isinstance(n, (ast.Name, ast.Attribute, ast.Call)) for n in ast.walk(a.test)) for a in assertions)
                raises = any(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'raises' for n in ast.walk(node))
                if not meaningful and not raises:
                    defect('TRIVIAL_WORKFLOW_TEST', file, node.lineno, 'Workflow test needs behavioral assertions against the application: ' + node.name)
                # Broad status code assertions
                for a in assertions:
                    if isinstance(a.test, ast.Compare):
                        left_is_status = isinstance(a.test.left, ast.Attribute) and a.test.left.attr == "status_code"
                        if left_is_status:
                            for op, comparator in zip(a.test.ops, a.test.comparators):
                                if isinstance(op, ast.In) and isinstance(comparator, (ast.Tuple, ast.List, ast.Set)):
                                    codes = [e.value for e in comparator.elts if isinstance(e, ast.Constant) and isinstance(e.value, int)]
                                    has_success = any(200 <= c < 300 for c in codes)
                                    has_error = any(400 <= c < 600 for c in codes)
                                    if len(codes) >= 3 or (has_success and has_error):
                                        defect("BROAD_STATUS_CODE_ASSERTION", file, a.lineno, f"Test {node.name} uses an overly permissive status code assertion: {ast.unparse(a.test)}")
                # Generic endpoint query check
                is_req_test = node.name.startswith("test_REQ_") or any(r in node.name.lower() for r in ("req_", "requirement", "req0", "req1", "req2", "req3", "req4", "req5", "req6", "req7", "req8", "req9"))
                if is_req_test or any(k in node.name.lower() for k in ("cart", "checkout", "order", "auth", "login", "user", "payment")):
                    called_endpoints = []
                    for call in ast.walk(node):
                        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr in ("get", "post", "put", "delete", "patch"):
                            if call.args and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str):
                                called_endpoints.append(call.args[0].value)
                    if called_endpoints and all(ep.startswith("/api/products") for ep in called_endpoints) and not any(k in node.name.lower() for k in ("product", "catalog", "browse", "item", "search")):
                        defect("GENERIC_REQUIREMENT_TEST", file, node.lineno, f"Test {node.name} queries generic /api/products instead of testing requirement-specific behavior")

    test_names = {file: [n.name for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name.startswith("test_")] for file, tree in trees.items()}
    routes = []
    for file, tree in trees.items():
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            parameters = {}
            body_fields = set()
            request_schema = None
            for arg in node.args.args:
                if isinstance(arg.annotation, ast.Name):
                    data = schema(file, arg.annotation.id)
                    if data:
                        parameters[arg.arg] = data
                        body_fields.update(data["required"])
                        request_schema = arg.annotation.id
            # Infer ORM/schema objects created locally or returned by a query.
            for child in ast.walk(node):
                if isinstance(child, ast.Assign):
                    called = next((call.args[0].id for call in ast.walk(child.value) if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "query" and call.args and isinstance(call.args[0], ast.Name)), None)
                    if not called and isinstance(child.value, ast.Call) and isinstance(child.value.func, ast.Name):
                        called = child.value.func.id
                    orm_data = next((d for (f, c), d in classes.items() if f.endswith("models.py") and c == called), None) if called else None
                    if orm_data:
                        data = {"fields": set(orm_data["fields"]), "required": set(orm_data["required"])}
                    else:
                        data = schema(file, called) if called else None
                    if data:
                        for target in child.targets:
                            if isinstance(target, ast.Name):
                                parameters[target.id] = data
            for child in ast.walk(node):
                if isinstance(child, ast.Attribute) and isinstance(child.value, ast.Name) and child.value.id in parameters:
                    param_schema = parameters[child.value.id]
                    if child.attr not in param_schema["fields"] and child.attr not in ignored_attrs:
                        if not param_schema.get("allows_extra"):
                            defect("SCHEMA_FIELD_MISMATCH", file, child.lineno, child.value.id + "." + child.attr + " is absent from its declared schema")
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == "Depends" and child.args and isinstance(child.args[0], ast.Name):
                    name = child.args[0].id
                    if name not in exports[file]:
                        defect("UNBOUND_DEPENDENCY", file, child.lineno, "Dependency is not defined/imported: " + name)
            for decorator in node.decorator_list:
                if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute) and decorator.func.attr in ("get", "post", "put", "patch", "delete") and decorator.args and isinstance(decorator.args[0], ast.Constant) and isinstance(decorator.func.value, ast.Name):
                    auth_guards = sorted({getattr(call.args[0], 'id', getattr(call.args[0], 'attr', '')) for part in node.args.defaults + [a.annotation for a in node.args.args if a.annotation] + [decorator] for call in ast.walk(part) if isinstance(call, ast.Call) and getattr(call.func, 'id', '') in ('Depends', 'Security') and call.args})
                    response_fields = None
                    response_shape = None
                    response_model = next((k.value for k in decorator.keywords if k.arg == "response_model"), None)
                    if isinstance(response_model, ast.Subscript):
                        if getattr(response_model.value, 'id', '') in ('List', 'list'):
                            response_shape = 'array'
                        response_model = response_model.slice
                    if isinstance(response_model, ast.Name):
                        response_data = schema(file, response_model.id)
                        if response_data:
                            response_fields = sorted(response_data["fields"])
                            response_shape = response_shape or "object"
                            if response_data.get("is_schema"):
                                is_token_model = (
                                    response_model.id in ("Token", "TokenResponse", "TokenData", "LoginResponse", "AuthResponse", "AuthToken", "RegisterResponse")
                                    or any(tok in response_model.id.lower() for tok in ("token", "auth", "login", "session"))
                                )
                                sensitive_fields = sorted(field for field in response_data["fields"] if field.lower() in {
                                    "password", "password_hash", "hashed_password", "secret_key"
                                } or (not is_token_model and field.lower() in {"access_token", "refresh_token"}))
                                if sensitive_fields:
                                    defect("SENSITIVE_RESPONSE_FIELD", file, node.lineno, "Response schema exposes sensitive fields: " + ", ".join(sensitive_fields))
                                if response_data.get("allows_extra"):
                                    defect("BROAD_RESPONSE_SCHEMA", file, node.lineno, "Business response schema allows arbitrary extra fields")
                                if response_model.id.endswith(("Create", "Update")):
                                    defect("OPERATION_SCHEMA_MISMATCH", file, node.lineno, f"Route response must use a dedicated response schema instead of {response_model.id}")
                    if response_fields is None:
                        found_keys = set()
                        return_shapes = set()
                        for ret in ast.walk(node):
                            if isinstance(ret, ast.Return) and isinstance(ret.value, (ast.Dict, ast.List)):
                                return_shapes.add('object' if isinstance(ret.value, ast.Dict) else 'array')
                        if len(return_shapes) == 1:
                            response_shape = return_shapes.pop()
                        for returned in ast.walk(node):
                            if isinstance(returned, ast.Return):
                                for d in ast.walk(returned):
                                    if isinstance(d, ast.Dict):
                                        found_keys.update(key.value for key in d.keys if isinstance(key, ast.Constant) and isinstance(key.value, str))
                        if found_keys:
                            response_fields = sorted(found_keys)
                    for prefix in prefixes((file, decorator.func.value.id)):
                        subpath = decorator.args[0].value
                        if subpath and not subpath.startswith("/"):
                            subpath = "/" + subpath
                        route = (prefix.rstrip("/") + subpath).rstrip("/") or "/"
                        routes.append(dict(file=file, line=node.lineno, method=decorator.func.attr.upper(), path=route, requiredFields=sorted(body_fields), requestSchema=request_schema, responseFields=response_fields, responseShape=response_shape, authGuards=auth_guards))
    orm_models = sorted(file + ":" + name for file, name in classes if is_orm_class(file, name))
    return dict(defects=defects, routes=routes, testNames=test_names, ormModels=orm_models)


if __name__ == "__main__":
    print(json.dumps(analyze(json.load(sys.stdin))))

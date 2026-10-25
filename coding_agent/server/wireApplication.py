"""Compose contracted routers without importing generated application code."""
import ast
import json
import sys


def wire(source, endpoints):
    tree = ast.parse(source)
    apps = [t.id for n in tree.body if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call) and getattr(n.value.func, 'id', getattr(n.value.func, 'attr', '')) == 'FastAPI' for t in n.targets if isinstance(t, ast.Name)]
    if not apps:
        apps = [t.id for n in tree.body if isinstance(n, ast.Assign) for t in n.targets if isinstance(t, ast.Name) and t.id == 'app']
    if 'app' in apps:
        apps = ['app']
    elif apps:
        apps = [apps[0]]
    else:
        apps = ['app']
    owners = {}
    for ep in endpoints:
        owner = ep.get('backendFile')
        if not owner or owner == 'backend/main.py':
            continue
        prefix = ep.get('routerPrefix', '').rstrip('/')
        if not prefix:
            continue
        if owner not in owners:
            owners[owner] = []
        if prefix not in owners[owner]:
            owners[owner].append(prefix)
    body = []
    for node in tree.body:
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute) and node.value.func.attr == 'include_router' and isinstance(node.value.func.value, ast.Name) and node.value.func.value.id == apps[0]:
            continue
        body.append(node)
    # Imports may already exist under arbitrary aliases; preserve those names.
    canonical_owners = {}
    for owner, prefixes in sorted(owners.items()):
        resource_name = owner.split('/')[-1].removesuffix('.py')
        if len(prefixes) == 1 and prefixes[0] != '/api':
            canonical_owners[owner] = prefixes[0]
        elif len(prefixes) > 1 and all(p.startswith('/api') for p in prefixes) and not all(p == f'/api/{resource_name}' for p in prefixes):
            canonical_owners[owner] = '/api'
        elif any(p.startswith('/') and not p.startswith('/api') for p in prefixes):
            non_api = [p for p in prefixes if not p.startswith('/api')]
            canonical_owners[owner] = non_api[0]
        else:
            canonical_owners[owner] = f'/{resource_name}' if not any(p.startswith('/api') for p in prefixes) else f'/api/{resource_name}'

    for index, (owner, prefix) in enumerate(sorted(canonical_owners.items())):
        module = owner.removeprefix('backend/').removesuffix('.py').replace('/', '.')
        imported = next((a.asname or a.name for n in body if isinstance(n, ast.ImportFrom) and n.module == module for a in n.names if a.name == 'router'), None)
        if imported is None:
            imported = '_contract_router_' + str(index)
            body.append(ast.ImportFrom(module=module, names=[ast.alias(name='router', asname=imported)], level=0))
        body.append(ast.Expr(value=ast.Call(func=ast.Attribute(value=ast.Name(id=apps[0], ctx=ast.Load()), attr='include_router', ctx=ast.Load()), args=[ast.Name(id=imported, ctx=ast.Load())], keywords=[ast.keyword(arg='prefix', value=ast.Constant(value=prefix))])))
    tree.body = body
    return ast.unparse(ast.fix_missing_locations(tree)) + '\n'


if __name__ == '__main__':
    request = json.load(sys.stdin)
    try:
        print(json.dumps({'content': wire(request['source'], request['endpoints'])}))
    except (SyntaxError, ValueError, KeyError) as error:
        print(json.dumps({'error': str(error)}))

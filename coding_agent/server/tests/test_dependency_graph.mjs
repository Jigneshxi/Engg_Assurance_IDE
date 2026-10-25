function sortFilesTopologically(files, manifest) {
    if (!manifest.project_requirements || !manifest.project_requirements.database) return files;
    const dbReqs = manifest.project_requirements.database;
    
    const adj = new Map();
    const inDegree = new Map();
    files.forEach(f => {
       adj.set(f.path, new Set());
       inDegree.set(f.path, 0);
    });
    
    const addEdge = (beforeFile, afterFile) => {
        if (beforeFile && afterFile && beforeFile.path !== afterFile.path) {
            if (!adj.get(beforeFile.path).has(afterFile.path)) {
                adj.get(beforeFile.path).add(afterFile.path);
                inDegree.set(afterFile.path, inDegree.get(afterFile.path) + 1);
            }
        }
    };

    const getFileForEntity = (name) => {
        if (!name) return null;
        const lowerName = name.toLowerCase().replace(/s$/, ''); // basic singularize
        return files.find(f => {
            const basename = f.path.split('/').pop().toLowerCase();
            return basename.includes(lowerName);
        });
    };

    (dbReqs.relationships || []).forEach(rel => {
        addEdge(getFileForEntity(rel.to), getFileForEntity(rel.from));
    });
    
    (dbReqs.foreign_keys || []).forEach(fk => {
        const target = fk.references ? fk.references.split('.')[0] : null;
        addEdge(getFileForEntity(target), getFileForEntity(fk.table));
    });

    const baseFiles = files.filter(f => f.path.toLowerCase().includes('base'));
    const models = files.filter(f => !baseFiles.includes(f) && (f.path.includes('models/') || (f.purpose && f.purpose.toLowerCase().includes('model'))));
    models.forEach(m => baseFiles.forEach(b => addEdge(b, m)));

    const infraFiles = files.filter(f => f.path.includes('seed') || f.path.includes('env') || f.path.includes('init') || f.path.includes('session'));
    infraFiles.forEach(infra => {
        models.forEach(m => addEdge(m, infra));
        baseFiles.forEach(b => addEdge(b, infra));
    });

    const queue = [];
    for (const [node, degree] of inDegree.entries()) {
        if (degree === 0) queue.push(node);
    }

    const sortedPaths = [];
    while (queue.length > 0) {
        const node = queue.shift();
        sortedPaths.push(node);
        for (const neighbor of adj.get(node)) {
            inDegree.set(neighbor, inDegree.get(neighbor) - 1);
            if (inDegree.get(neighbor) === 0) queue.push(neighbor);
        }
    }

    if (sortedPaths.length !== files.length) {
        const remaining = files.filter(f => !sortedPaths.includes(f.path));
        return [...sortedPaths.map(p => files.find(f => f.path === p)), ...remaining];
    }
    return sortedPaths.map(p => files.find(f => f.path === p));
}

const mockManifest = {
  project_requirements: {
    database: {
      relationships: [
        { from: "Order", to: "User" },
        { from: "CartItem", to: "Product" }
      ],
      foreign_keys: [
        { table: "orders", references: "users.id" },
        { table: "cart_items", references: "products.id" }
      ]
    }
  }
};

const mockFiles = [
  { path: 'backend/app/models/order.py' },
  { path: 'backend/app/models/user.py' },
  { path: 'backend/app/db/seed.py' },
  { path: 'backend/app/db/base.py' },
  { path: 'backend/app/models/product.py' },
  { path: 'backend/app/models/cart_item.py' },
  { path: 'backend/alembic/env.py' }
];

const sorted = sortFilesTopologically(mockFiles, mockManifest);
const sortedPaths = sorted.map(f => f.path);
console.log('Sorted Paths:', sortedPaths);

const assertIndexBefore = (path1, path2) => {
    const idx1 = sortedPaths.indexOf(path1);
    const idx2 = sortedPaths.indexOf(path2);
    if (idx1 === -1 || idx2 === -1) throw new Error(`Path missing in sort: ${path1} or ${path2}`);
    if (idx1 >= idx2) {
        throw new Error(`Dependency failed: ${path1} should be before ${path2}`);
    }
};

assertIndexBefore('backend/app/db/base.py', 'backend/app/models/user.py');
assertIndexBefore('backend/app/db/base.py', 'backend/app/models/order.py');
assertIndexBefore('backend/app/models/user.py', 'backend/app/models/order.py');
assertIndexBefore('backend/app/models/product.py', 'backend/app/models/cart_item.py');
assertIndexBefore('backend/app/models/order.py', 'backend/app/db/seed.py');
assertIndexBefore('backend/app/models/cart_item.py', 'backend/alembic/env.py');

console.log('✅ test_dependency_graph passed.');

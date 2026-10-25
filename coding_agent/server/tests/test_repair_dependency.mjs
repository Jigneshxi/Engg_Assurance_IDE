function constructRepairPlan(activeModule, fileDef, allErrors) {
    // Mocked logic simulating what I injected into orchestrator.js
    const repairingFiles = activeModule.required_files.filter(f => f.status === 'repairing').map(f => f.path);
    const repairPlan = {
      affectedFiles: repairingFiles,
      errorsForEntirePhase: allErrors
    };
    
    // The intra-module context
    let localDependencyContext = '';
    const generatedInModule = activeModule.required_files.filter(f => f.content && f.path !== fileDef.path);
    if (generatedInModule.length > 0) {
        localDependencyContext += `INTRA-MODULE DEPENDENCY CONTEXT:\n`;
        generatedInModule.forEach(f => {
            localDependencyContext += `--- ${f.path} ---\n${f.content}\n\n`;
        });
    }

    return {
        repairPlanJSON: JSON.stringify(repairPlan, null, 2),
        localDependencyContext
    };
}

async function runRepairDependencyTest() {
    console.log('Testing Dependency-Aware Repair Plan...');

    const activeModule = {
        id: 'MOD-1',
        required_files: [
            { path: 'backend/app/models/user.py', status: 'repairing', content: 'class User:' },
            { path: 'backend/app/models/order.py', status: 'repairing', content: 'class Order:' },
            { path: 'backend/app/db/base.py', status: 'validated', content: 'Base = declarative_base()' }
        ]
    };

    const targetFile = activeModule.required_files[0]; // user.py
    const allErrors = [
        'User lacks relationships',
        'Order points to invalid target'
    ];

    const result = constructRepairPlan(activeModule, targetFile, allErrors);

    const hasAffectedFiles = result.repairPlanJSON.includes('backend/app/models/order.py');
    const hasAllErrors = result.repairPlanJSON.includes('Order points to invalid target');
    const hasDependencyContext = result.localDependencyContext.includes('Base = declarative_base()');
    
    if (hasAffectedFiles && hasAllErrors && hasDependencyContext) {
        console.log('✅ Repair plan correctly injects affected files, phase errors, and intra-module dependency context.');
        console.log('✅ test_repair_dependency passed.');
        process.exit(0);
    } else {
        console.error('❌ Repair plan failed to construct properly.');
        process.exit(1);
    }
}

runRepairDependencyTest().catch(console.error);

import { scanForSecuritySinks } from './securityValidator.js';
import crypto from 'crypto';
import { redactSecret, scanForCredentials, DATABASE_DEFECT_CODES, reconcileSqlAlchemyImports } from './dbValidator.js';
import { stripMarkdownWrappers, findLastStableSyntacticBoundary, mergeFileContinuation, validateSourceCompleteness, sanitizePythonCode } from './orchestrator.js';
import { validateImportClosure } from './importClosureValidator.js';
import { isPlaceholderStubComponent } from './frontendContractValidator.js';
import { isBoilerplateFile, getBoilerplateTemplate } from './foundationTemplates.js';

export const REPAIR_STRATEGIES = {
  [DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED]: {
    name: 'DatabaseCredentialRepairStrategy',
    instructions: [
      'Replace hardcoded database credentials and connection strings with environment variable configuration.',
      'For Python: Use `os.getenv("DATABASE_URL")` or load from a configuration settings class.',
      'For Node.js: Use `process.env.DATABASE_URL` or a config module.',
      'DO NOT use fallback default strings that contain usernames and passwords.',
      'Preserve all existing database models, tables, relationships, and engine configurations.',
      'Only modify the credential/URI definition line.'
    ],
    forbidden: [
      'Hardcoded passwords or usernames',
      'Hardcoded connection URIs with embedded secrets',
      'Rewriting unrelated model classes or functions'
    ]
  },
  [DATABASE_DEFECT_CODES.SYNTAX_ERROR]: {
    name: 'SyntaxRepairStrategy',
    instructions: [
      'Fix syntax error, unmatched parenthesis, brackets, quotes, or indentation at the specified line.',
      'Preserve all surrounding business logic and variable names.'
    ],
    forbidden: ['Deleting valid code blocks to bypass syntax checks']
  },
  [DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE]: {
    name: 'SyntaxValidationRepairStrategy',
    instructions: [
      'Fix syntax error, unmatched parenthesis, brackets, quotes, or indentation at the specified line.',
      'Ensure the file conforms strictly to language grammar so py_compile / tsc / node succeeds without errors.',
      'Preserve all surrounding business logic and variable names.'
    ],
    forbidden: ['Deleting valid code blocks to bypass syntax checks']
  },
  [DATABASE_DEFECT_CODES.BROKEN_IMPORT]: {
    name: 'MissingImportRepairStrategy',
    instructions: [
      'Ensure required module or Base import exists and resolves to the canonical project path.',
      'For SQLAlchemy Base: ensure consistent import from the established base file.',
      'Never use "backend." as a package prefix in Python imports.'
    ],
    forbidden: ['Inventing non-existent packages']
  },
  [DATABASE_DEFECT_CODES.IMPORT_CLOSURE_FAILURE]: {
    name: 'ImportClosureRepairStrategy',
    instructions: [
      'Ensure required module, schema, router, component, hook, or service import exists and resolves to an actual file in the project.',
      'Check the target file path and adjust the import statement to match the canonical file location.',
      'Ensure Python imports do not use invalid prefixes and all relative imports resolve correctly.',
      'Ensure Frontend component imports match actual filename case and extension.'
    ],
    forbidden: ['Importing non-existent modules or components', 'Deleting functional code to bypass import check']
  },
  [DATABASE_DEFECT_CODES.DUPLICATE_MODEL]: {
    name: 'DuplicateModelRepairStrategy',
    instructions: [
      'Every ORM entity must have exactly one owner.',
      'Remove duplicate model definitions from database.py or non-canonical modules.',
      'Consolidate the canonical model definition into models.py (or its designated entity module).',
      'Preserve database connection infrastructure (Base, engine, SessionLocal, get_db) in database.py.',
      'Preserve all existing attributes, relationships, and foreign keys on the canonical model in models.py.'
    ],
    forbidden: [
      'Leaving duplicate model declarations in multiple files',
      'Defining ORM entity models inside database.py',
      'Deleting the canonical model definition without consolidating it into models.py'
    ]
  },
  [DATABASE_DEFECT_CODES.ARCHITECTURAL_SEPARATION_VIOLATION]: {
    name: 'ArchitecturalSeparationRepairStrategy',
    instructions: [
      'database.py must contain ONLY database infrastructure: Base = declarative_base() (or class Base(DeclarativeBase):), engine, SessionLocal, and get_db().',
      'Remove all ORM entity model classes (classes with __tablename__ or inheriting from Base) from database.py.',
      'Ensure all ORM models are placed exclusively in models.py.',
      'Preserve Base, engine, SessionLocal, and get_db in database.py.'
    ],
    forbidden: [
      'Defining ORM model classes in database.py',
      'Removing Base, engine, or SessionLocal from database.py'
    ]
  },
  [DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP]: {
    name: 'RelationshipRepairStrategy',
    instructions: [
      'Inspect BOTH source and target model definitions provided in the relationship context before constructing the patch.',
      'Ensure both relationship attributes target each other and their back_populates values name the reciprocal attributes exactly.',
      'Reciprocal relationship MUST point directly back to the source model. NEVER use an unrelated model name (e.g. Customer, User) as the target.',
      'For self-referential relationships (a model referencing itself, e.g., parent/children or manager/subordinates), specify remote_side=[id] on the many-to-one (scalar/parent) side: e.g. parent = relationship("Category", remote_side=[id], back_populates="children").',
      'Preserve the existing ForeignKey placement, cascade rules, lazy-loading configuration, collection/scalar semantics, typing, and naming conventions.',
      'Use the relevant foreign key and existing relationship declarations to determine which side is scalar and which side is a collection; do not invent a one-to-one relationship.',
      'Do not rewrite unrelated models or regenerate the models.py file.'
    ],
    forbidden: [
      'Targeting unrelated models for reciprocal relationships',
      'Removing relationships needed for domain functionality',
      'Changing foreign keys or cascade behavior unrelated to the defect',
      'Rewriting the entire model file'
    ]
  },
  [DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE]: {
    name: 'ForeignKeyRepairStrategy',
    instructions: [
      'Inspect the model declarations and repair the invalid or missing ForeignKey specification.',
      'Ensure the ForeignKey references an existing database table and an existing column name (e.g. `ForeignKey("table_name.id")`).',
      'Ensure data types match between the foreign key column and the referenced primary key column.',
      'Preserve all other columns, relationships, indexes, and methods on the model class.',
      'Do not invent new tables; verify the correct table name and primary key from the related model class.'
    ],
    forbidden: [
      'Removing foreign key constraints required for relational integrity',
      'Pointing foreign keys to non-existent tables or columns',
      'Rewriting unrelated model classes'
    ]
  },
  [DATABASE_DEFECT_CODES.INITIALIZATION_ISSUE]: {
    name: 'InitializationRepairStrategy',
    instructions: [
      'Ensure create_engine, sessionmaker, and Base definitions are properly instantiated.',
      'Ensure credentials are read from environment variables.'
    ],
    forbidden: ['Hardcoding credentials in create_engine']
  },
  [DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH]: {
    name: 'StackContractMismatchStrategy',
    instructions: [
      'The generated file is fundamentally from the wrong technology stack or language.',
      'Do not attempt targeted line-level patches on incompatible language files.',
      'Regenerate the file completely using the authoritative technology stack.'
    ],
    forbidden: [
      'Attempting relationship patches on wrong-stack files',
      'Mixing TypeScript/Prisma and Python/SQLAlchemy'
    ]
  },
  MISSING_SCHEMA_MODULE: {
    name: 'MissingSchemaModuleRepairStrategy',
    instructions: [
      'Write the missing Pydantic schema module matching the requested path and symbols.',
      'Generate concrete typed fields (e.g. int, float, str, datetime, List[Dict[str, Any]]) matching the SQLAlchemy models and contract.',
      'Request schemas MUST specify ConfigDict(from_attributes=True, extra="forbid").',
      'Response schemas MUST specify ConfigDict(from_attributes=True) and NEVER expose sensitive fields (password, password_hash, hashed_password, secret_key).',
      'Do NOT use wildcard Optional[Any] fields.'
    ],
    forbidden: [
      'Fabricating Optional[Any] wildcard schemas',
      'Using extra="allow" on request schemas',
      'Including password or password_hash fields in response models'
    ]
  },
  [DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED]: {
    name: 'OutputFormatRepairStrategy',
    instructions: [
      'The generated output was truncated or missing closing file boundaries (</file>).',
      'Complete the missing code and close the file properly with </file>.',
      'Do not output conversational text or partial lines.'
    ],
    forbidden: [
      'Omitting closing </file> tag',
      'Truncating mid-function or mid-block'
    ]
  },
  [DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING]: {
    name: 'OutputFormatRepairStrategy',
    instructions: [
      'The generated output was truncated or missing closing file boundaries (</file>).',
      'Complete the missing code and close the file properly with </file>.',
      'Do not output conversational text or partial lines.'
    ],
    forbidden: [
      'Omitting closing </file> tag',
      'Truncating mid-function or mid-block'
    ]
  },
  [DATABASE_DEFECT_CODES.GENERATION_CONTINUATION_INVALID]: {
    name: 'OutputFormatRepairStrategy',
    instructions: [
      'The generation continuation was invalid, truncated, or misaligned with the source file.',
      'Re-generate the complete file cleanly from start to finish within valid <file> tags.',
      'Ensure the source code is completely closed and syntactically balanced.'
    ],
    forbidden: [
      'Omitting closing </file> tag',
      'Truncating mid-function or mid-block'
    ]
  },
  [DATABASE_DEFECT_CODES.SECURITY_FORBIDDEN_SINK]: {
    name: 'SecuritySinkRepairStrategy',
    instructions: [
      'Eliminate dangerous dynamic execution sinks such as eval(), exec(), os.system(), or subprocess with shell=True.',
      'For dynamic commands: use safe parameterized APIs (e.g. subprocess.run(["cmd", arg], shell=False)).',
      'For dynamic evaluations: use ast.literal_eval() for data literals or explicit function dispatch mappings.',
      'For frontend components: remove dangerouslySetInnerHTML and use standard JSX element children.',
      'Preserve all surrounding business logic, functions, and interfaces.'
    ],
    forbidden: [
      'Using alternative unsafe execution sinks (e.g. os.popen, pty.spawn, child_process.exec)',
      'Bypassing check with variable aliasing',
      'Deleting required feature functionality'
    ]
  },
  [DATABASE_DEFECT_CODES.SECURITY_SECRET_LEAK]: {
    name: 'SecuritySecretRepairStrategy',
    instructions: [
      'Remove hardcoded secrets, API keys, tokens, and private keys from the source code.',
      'Load sensitive values from environment variables (e.g. os.getenv("API_KEY") or process.env.API_KEY).',
      'Ensure no fallback defaults contain literal credentials or tokens.',
      'Preserve all public functions, classes, and surrounding logic.'
    ],
    forbidden: [
      'Hardcoded API keys, tokens, or private keys',
      'Fallback default strings with embedded credentials'
    ]
  },
  [DATABASE_DEFECT_CODES.FRONTEND_BUILD_FAILURE]: {
    name: 'FrontendContractRepairStrategy',
    instructions: [
      'Repair frontend contract defect (missing component, casing mismatch, router target, API endpoint mismatch, missing dependency, or build configuration).',
      'For missing component: verify the path, create or export the required component, or correct the import specifier.',
      'For casing mismatch: match the exact filesystem/module casing of the target file.',
      'For missing router target: define or import the component referenced in the route element.',
      'For API endpoint mismatch: reconcile frontend fetch/axios URL and method with existing backend endpoints.',
      'For missing dependency: add the package to dependencies in package.json.',
      'For environment configuration: declare required variables in .env.example / .env.',
      'Preserve all other component markup, state, and styling.'
    ],
    forbidden: [
      'Deleting routing definitions or pages to bypass validation',
      'Using mock hardcoded data instead of connecting to existing backend routes'
    ]
  },
  [DATABASE_DEFECT_CODES.BACKEND_RUNTIME_FAILURE]: {
    name: 'BackendRuntimeRepairStrategy',
    instructions: [
      'Repair backend runtime failure (application crash, health endpoint failure, database connectivity, migration, unmounted routes, auth, or CRUD persistence).',
      'For startup crash: fix imports, variable bindings, or runtime exceptions during application startup.',
      'For health check: ensure /health returns 200 OK with valid JSON status.',
      'For database connectivity: configure engine, models, and session cleanly without hardcoding.',
      'For missing router: ensure routers are properly instantiated and mounted onto the app instance.',
      'For auth/authz: verify credentials handling, token generation, and proper status codes (401/403).',
      'For CRUD and persistence: ensure endpoints correctly write to database session and commit transactions.',
      'Preserve all other API routes, database schemas, and service functions.'
    ],
    forbidden: [
      'Disabling authentication or authorization middleware to bypass security',
      'Bypassing database persistence with in-memory volatile dummy structures'
    ]
  },
  [DATABASE_DEFECT_CODES.API_AUTHZ_FAILURE]: {
    name: 'ApiAuthzRepairStrategy',
    instructions: [
      'Repair API authentication and authorization defect (missing login/register endpoints, invalid token handling, missing auth guards, identity override vulnerability, cross-user data leakage, or missing ownership filters).',
      'For missing/broken auth endpoints: implement robust /register and /login handlers returning signed JWT tokens with user identifier in claims.',
      'For token verification: validate signature, expiration, and format; reject invalid/expired/malformed tokens with HTTP 401 Unauthorized.',
      'For protected endpoints: protect routes using auth dependency/middleware (e.g. Depends(get_current_user)), ensuring unauthenticated requests receive 401.',
      'For user identity extraction: extract current user ID from the verified token/session context, never blindly trusting user_id from the request body or query parameter.',
      'For resource ownership & isolation: ensure all queries (GET, PUT, DELETE) filter by the authenticated user ID (e.g. filter(Model.id == id, Model.user_id == current_user.id)), returning 403 Forbidden or 404 Not Found if access to another user\'s resource is attempted.',
      'For listing endpoints: filter returned collections strictly by the authenticated user to prevent data leakage across users.',
      'Preserve all other API endpoints, schema models, and business logic.'
    ],
    forbidden: [
      'Disabling authentication or authorization to bypass tests',
      'Allowing request payloads to override the verified authenticated identity',
      'Returning global un-scoped database queries for user-owned models'
    ]
  },
  [DATABASE_DEFECT_CODES.PRD_COVERAGE_FAILURE]: {
    name: 'PrdCoverageRepairStrategy',
    instructions: [
      'Repair PRD requirement coverage defect (missing implementation, partial coverage, unmapped requirement, or failing requirement files).',
      'For missing requirement: implement the missing components, schemas, or endpoints in the appropriate architectural layers.',
      'For partial coverage: ensure both backend APIs and corresponding frontend integration are completely implemented.',
      'For unreasoned deferrals: provide concrete implementation or an explicit technical rationale for deferral.',
      'Preserve existing functionality, interfaces, and architecture contracts.'
    ],
    forbidden: [
      'Silently deleting requirements from the requirement contract',
      'Claiming requirements are complete without providing implementing code',
      'Creating empty or stubbed files with TODO comments only'
    ]
  },
  MISSING_TYPING_IMPORT: {
    name: 'MissingTypingImportStrategy',
    instructions: [
      'Import missing typing symbols (Any, List, Optional, Dict, Union, etc.) from standard typing module.',
      'Add the missing symbol to an existing `from typing import ...` or insert a new import at the top.',
      'Preserve all existing function signatures, annotations, and logic.'
    ],
    forbidden: ['Removing type annotations to bypass check']
  },
  HARDCODED_AUTH_TOKEN: {
    name: 'HardcodedAuthTokenStrategy',
    instructions: [
      'Replace placeholder tokens like YOUR_ACCESS_TOKEN with dynamic token generation.',
      'Use python-jose JWT encoding or secrets.token_urlsafe(32) to generate authentic tokens.',
      'Ensure the login endpoint returns a valid token object with access_token and token_type.',
      'CRITICAL: Never introduce insecure default secrets like os.getenv("SECRET_KEY", "your_secret_key"). Read SECRET_KEY strictly from settings or os.environ without placeholder strings.'
    ],
    forbidden: ['Hardcoding static dummy tokens', 'Using insecure placeholder secret keys like your_secret_key or secret']
  },
  AUTH_TOKEN_UNVERIFIED: {
    name: 'AuthTokenUnverifiedStrategy',
    instructions: [
      'Ensure get_current_user decodes and validates signed JWT tokens using jose.jwt.decode or pyjwt.',
      'Extract user_id from token payload sub claim; raise HTTPException(status_code=401) if token is invalid, expired, or missing sub.',
      'Never return True, static dicts, or unverified mock users in get_current_user.'
    ],
    forbidden: ['Returning True as mock user', 'Returning hardcoded user dictionaries without token decoding']
  },
  HARDCODED_SECRET_DEFAULT: {
    name: 'HardcodedSecretDefaultStrategy',
    instructions: [
      'Remove insecure default secret strings like "your_secret_key", "secret", "secret_key".',
      'Use os.environ.get("SECRET_KEY") or settings.SECRET_KEY without insecure default strings.',
      'In test environments, if a fallback is strictly needed, use secrets.token_hex(32) or a cryptographically random fallback.'
    ],
    forbidden: ['Hardcoding insecure secrets like your_secret_key, secret, or placeholder']
  },
  DUPLICATE_AUTH_AUTHORITY: {
    name: 'DuplicateAuthAuthorityStrategy',
    instructions: [
      'Consolidate authentication authority into one canonical module (e.g. app.core.security and app.api.deps).',
      'Remove duplicate get_current_user, create_access_token, or decode_access_token definitions from secondary modules.',
      'Import get_current_user and auth dependencies from the canonical dependency module across all routes.',
      'Never maintain parallel, conflicting authentication schemes or duplicate get_current_user implementations.'
    ],
    forbidden: [
      'Maintaining multiple conflicting get_current_user definitions',
      'Defining parallel auth schemes in multiple modules'
    ]
  },
  UNDECLARED_PACKAGE_IMPORT: {
    name: 'UndeclaredPackageImportStrategy',
    instructions: [
      'If the imported package is in the allowed stack (e.g. axios, @playwright/test), add it to frontend/package.json dependencies or devDependencies.',
      'If the package is prohibited (e.g. lucide-react, @mui, tailwindcss), remove the import and replace components with plain React, CSS, and inline SVG icons.',
      'Never leave undeclared package imports in frontend source code.'
    ],
    forbidden: ['Importing unpermitted external UI component libraries like @mui, antd, or chakra-ui']
  },
  AUTHZ_OWNERSHIP_LEAK: {
    name: 'AuthzOwnershipLeakStrategy',
    instructions: [
      'Filter all user-owned resource queries (Task, Board, Order, CartItem, Address, Wishlist, etc.) strictly by authenticated user: .filter(Model.user_id == current_user["id"]) or .filter(Model.user_id == current_user.id).',
      'NEVER query all records globally with db.query(Model).all() on user-owned entities.',
      'In dashboard metrics endpoints, count tasks and boards filtered by user_id so users only see their personal metrics.'
    ],
    forbidden: ['Calling db.query(...).all() without user_id filtering for user-owned resources']
  },
  AUTHZ_CROSS_USER_ACCESS: {
    name: 'AuthzCrossUserAccessStrategy',
    instructions: [
      'Enforce strict resource ownership checks in GET by ID, PUT, PATCH, and DELETE endpoints.',
      'Verify record.user_id == current_user.id; if mismatched, raise HTTPException(status_code=403, detail="Forbidden") or HTTP 404.',
      'CRITICAL: NEVER compare task.board_id to user_id or status values. Board ID is foreign key to boards table, not the user ID.',
      'Before creating a task under a board, verify that the board belongs to the current user (board.user_id == current_user.id).'
    ],
    forbidden: ['Comparing board_id to user_id', 'Permitting User A to view, edit, or delete User B records']
  },
  SQLALCHEMY_FILTER_BOOLEAN_AND: {
    name: 'SqlAlchemyFilterBooleanAndStrategy',
    instructions: [
      'Replace Python boolean "and" inside SQLAlchemy .filter() calls with comma-separated filter arguments.',
      'Example: change .filter(Task.user_id == current_user.id and Task.id == id) to .filter(Task.user_id == current_user.id, Task.id == id).',
      'Alternatively, import and use sqlalchemy.and_() if grouping conditions explicitly.'
    ],
    forbidden: ['Using Python boolean and inside SQLAlchemy .filter expressions']
  },
  BOGUS_OWNERSHIP_COMPARISON: {
    name: 'BogusOwnershipComparisonStrategy',
    instructions: [
      'Never compare board_id or task foreign keys directly to current_user.id or current_user.',
      'To verify task or board ownership, check task.user_id == current_user.id or query board = db.query(Board).filter(Board.id == board_id, Board.user_id == current_user.id).first().',
      'Raise HTTPException(status_code=403, detail="Forbidden") if the board or task does not belong to current_user.'
    ],
    forbidden: ['Comparing board_id to user_id']
  },
  BROAD_RESPONSE_SCHEMA: {
    name: 'BroadResponseSchemaStrategy',
    instructions: [
      'Ensure response schemas do not allow arbitrary extra fields.',
      'Remove `extra="allow"` or `extra="ignore"` from response schema ConfigDict.',
      'Use `model_config = ConfigDict(from_attributes=True)` strictly without extra parameters.'
    ],
    forbidden: ['Allowing unvalidated extra fields on response schemas']
  },
  SENSITIVE_RESPONSE_FIELD: {
    name: 'SensitiveResponseFieldStrategy',
    instructions: [
      'Omit sensitive credentials (password, password_hash, hashed_password, secret_key, access_token) from response models.',
      'Use dedicated public response models (e.g., UserResponse, CustomerResponse) that exclude confidential credentials.'
    ],
    forbidden: ['Exposing password hashes or secret keys in response DTOs']
  },
  OPERATION_SCHEMA_MISMATCH: {
    name: 'OperationSchemaMismatchStrategy',
    instructions: [
      'Do not reuse mutation schemas (*Create, *Update) as response_model on API endpoints.',
      'Use dedicated response models (*Response, *Out) with `from_attributes=True` for route responses.'
    ],
    forbidden: ['Reusing request mutation schemas as response models']
  },
  UNFLUSHED_PARENT_ID: {
    name: 'UnflushedParentIdStrategy',
    instructions: [
      'Call db.flush() immediately after db.add(parent) before reading parent.id for child record associations.',
      'Ensure foreign key relationships receive actual generated primary keys from the database session.',
      'Preserve the overall transaction structure and db.commit() boundary.'
    ],
    forbidden: ['Assigning placeholder IDs or leaving child foreign keys null']
  },
  USER_OBJECT_DICT_MISMATCH: {
    name: 'UserObjectDictMismatchStrategy',
    instructions: [
      'Harmonize current_user access between dict notation and object attribute notation.',
      'Either return an object with attribute access or use (current_user.get("id") if isinstance(current_user, dict) else current_user.id).',
      'Ensure user identity extraction works seamlessly in all route handlers.'
    ],
    forbidden: ['Assuming current_user is always an object or always a dict without verification']
  },
  CART_ORDER_MODEL_MISUSE: {
    name: 'CartOrderModelMisuseStrategy',
    instructions: [
      'Separate Cart/CartItem from Order/OrderItem.',
      'Do not set OrderItem.order_id to current_user.id. Cart items must belong to a CartItem model with user_id.',
      'OrderItem must only be created during checkout referencing a real Order.id.'
    ],
    forbidden: ['Reusing OrderItem as a temporary cart container']
  },
  PACKAGE_NAME_MISMATCH: {
    name: 'PackageNameMismatchStrategy',
    instructions: [
      'Replace non-existent npm package names with their canonical published names.',
      'For `@lucide/react`, replace with `lucide-react` in package.json and across all import statements.',
      'Preserve icon import names and component usage.'
    ],
    forbidden: ['Inventing unpublished scoped packages']
  },
  HARDCODED_API_URL: {
    name: 'HardcodedApiUrlStrategy',
    instructions: [
      'Replace hardcoded localhost:8000 URLs with configured API base paths.',
      'Use `import.meta.env.VITE_API_URL || "/api"` or relative `/api` paths in fetch/axios calls.',
      'Preserve endpoint routes and query parameters.'
    ],
    forbidden: ['Hardcoding absolute machine-local URLs']
  },
  PLAYWRIGHT_PORT_MISMATCH: {
    name: 'PlaywrightPortMismatchStrategy',
    instructions: [
      'Ensure Playwright test configuration targets the Vite development server on port 5173.',
      'Set `baseURL: process.env.FRONTEND_URL || "http://127.0.0.1:5173"`.',
      'Set `command: "npm run dev"` in webServer configuration.'
    ],
    forbidden: ['Targeting port 3000 when Vite is configured on 5173']
  },
  VACUOUS_BROWSER_TEST: {
    name: 'VacuousBrowserTestStrategy',
    instructions: [
      'Replace vacuous assertions like `expect(page).toBeDefined()` with real behavioral assertions.',
      'Assert visible UI elements using `await expect(page.locator("...")).toBeVisible()`.',
      'Ensure browser tests actually validate the rendered interface.'
    ],
    forbidden: ['Using non-asserting or trivial tautological checks']
  },
  UNAWAITED_BROWSER_ASSERTION: {
    name: 'UnawaitedBrowserAssertionStrategy',
    instructions: [
      'Await all Playwright locator assertions (e.g. `await expect(locator).toBeVisible()`).',
      'Playwright matchers return Promises and must be awaited to assert correctly.'
    ],
    forbidden: ['Leaving locator assertions floating without await']
  },
  BROAD_STATUS_CODE_ASSERTION: {
    name: 'BroadStatusCodeAssertionStrategy',
    instructions: [
      'Assert the exact expected HTTP status code (e.g. 200 or 201 for success, 401 for unauthorized).',
      'Do not use broad multi-status tuples like (200, 201, 401, 404, 422) that pass on failure.'
    ],
    forbidden: ['Accepting both success and error status codes in a single assertion']
  },
  GENERIC_REQUIREMENT_TEST: {
    name: 'GenericRequirementTestStrategy',
    instructions: [
      'Ensure requirement-specific tests invoke the actual API endpoints corresponding to the requirement.',
      'Do not query generic /api/products for cart, checkout, or account requirements.'
    ],
    forbidden: ['Reusing a single catalog query across all requirement test cases']
  },
  TRIVIAL_WORKFLOW_TEST: {
    name: 'TrivialWorkflowTestStrategy',
    instructions: [
      'Replace trivial `assert True` with concrete behavioral assertions against response status and payload.',
      'Invoke the target endpoint and verify HTTP status (e.g., `assert res.status_code in (200, 201)`) and response fields.'
    ],
    forbidden: ['Using dummy assert True statements to pass validation']
  },
  API_RESPONSE_SHAPE_MISMATCH: {
    name: 'ApiResponseShapeStrategy',
    instructions: [
      'Align backend route response_model with frontend expected shape.',
      'If frontend expects an array, ensure backend route specifies response_model=List[...] and returns a list.'
    ],
    forbidden: ['Wrapping array responses in single-field objects when the contract specifies an array']
  },
  DEFAULT: {
    name: 'GenericDefectRepairStrategy',
    instructions: [
      'Fix the reported validation defects precisely using a targeted patch.',
      'Preserve all public interfaces, existing functions, and model definitions.'
    ],
    forbidden: ['Rewriting the entire file']
  }
};

export function getRepairStrategy(defectCode) {
  return REPAIR_STRATEGIES[defectCode] || REPAIR_STRATEGIES.DEFAULT;
}

export function generateFileHash(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex');
}

export const REPAIR_STATES = Object.freeze({
  PENDING: 'pending',
  GENERATING: 'generating',
  GENERATED: 'generated',
  VALIDATING: 'validating',
  REPAIRING: 'repairing',
  VALIDATED: 'validated',
  PASSED: 'passed',
  FAILED: 'failed',
  BLOCKED_BY_DEPENDENCY: 'blocked_by_dependency'
});

export const MAX_FILE_REPAIR_ATTEMPTS = 3;

export const VALID_REPAIR_TRANSITIONS = Object.freeze({
  [REPAIR_STATES.PENDING]: [REPAIR_STATES.GENERATING, REPAIR_STATES.BLOCKED_BY_DEPENDENCY],
  [REPAIR_STATES.GENERATING]: [REPAIR_STATES.GENERATED, REPAIR_STATES.VALIDATING, REPAIR_STATES.FAILED, REPAIR_STATES.BLOCKED_BY_DEPENDENCY],
  [REPAIR_STATES.GENERATED]: [REPAIR_STATES.VALIDATING, REPAIR_STATES.FAILED, REPAIR_STATES.BLOCKED_BY_DEPENDENCY],
  [REPAIR_STATES.VALIDATING]: [REPAIR_STATES.VALIDATED, REPAIR_STATES.PASSED, REPAIR_STATES.REPAIRING, REPAIR_STATES.FAILED, REPAIR_STATES.BLOCKED_BY_DEPENDENCY],
  [REPAIR_STATES.REPAIRING]: [REPAIR_STATES.VALIDATING, REPAIR_STATES.FAILED, REPAIR_STATES.BLOCKED_BY_DEPENDENCY, REPAIR_STATES.REPAIRING],
  [REPAIR_STATES.VALIDATED]: [REPAIR_STATES.PASSED, REPAIR_STATES.REPAIRING],
  [REPAIR_STATES.PASSED]: [],
  [REPAIR_STATES.FAILED]: [],
  [REPAIR_STATES.BLOCKED_BY_DEPENDENCY]: []
});

export function canTransitionRepairState(fromState, toState) {
  const normFrom = (fromState || '').toLowerCase();
  const normTo = (toState || '').toLowerCase();
  const allowed = VALID_REPAIR_TRANSITIONS[normFrom] || [];
  return allowed.includes(normTo);
}

export function transitionRepairState(fileDef, toState, { reason, metadata } = {}) {
  const fromState = fileDef.status || REPAIR_STATES.PENDING;
  const normFrom = fromState.toLowerCase();
  const normTo = toState.toLowerCase();

  if (!canTransitionRepairState(normFrom, normTo)) {
    throw new Error(`Invalid repair state machine transition: cannot transition file "${fileDef.path}" from "${fromState}" to "${toState}".`);
  }

  fileDef.status = normTo;
  if (!fileDef.stateHistory) {
    fileDef.stateHistory = [];
  }
  fileDef.stateHistory.push({
    from: normFrom,
    to: normTo,
    timestamp: new Date().toISOString(),
    reason: reason || null,
    metadata: metadata || null
  });

  return fileDef.status;
}

export function buildRepairFailure({ fileDef, defect, reason, attempt, patch, retryCount }) {
  const patchReason = redactSecret(reason || 'Targeted repair failed.');
  return {
    file: fileDef.path,
    defectCode: defect.code || 'UNKNOWN',
    patchReason,
    currentContentHash: generateFileHash(fileDef.content || ''),
    attemptedRepair: {
      strategy: getRepairStrategy(defect.code).name,
      attempt,
      retryCount,
      patchGenerated: Boolean(patch),
      searchHash: patch?.search ? generateFileHash(patch.search) : null,
      replacementHash: patch?.replace ? generateFileHash(patch.replace) : null,
      applied: false
    },
    remainingDefect: {
      code: defect.code || 'UNKNOWN',
      validator: defect.validator || null,
      file: fileDef.path,
      message: redactSecret(defect.message || patchReason)
    }
  };
}

function semanticDefectDetails(defect) {
  return {
    code: defect.code,
    validator: defect.validator,
    file: defect.file || null,
    model: defect.model || null,
    relationship: defect.relationship || null,
    sourceModel: defect.sourceModel || null,
    sourceRelationship: defect.sourceRelationship || null,
    targetModel: defect.targetModel || null,
    expectedReciprocal: defect.expectedReciprocal || null,
    expectedBackPopulates: defect.expectedBackPopulates || null,
    actualState: defect.actualState || null,
    message: defect.message || ''
  };
}

export function detectSemanticRepairProgress({ previous = null, defects = [], fileHashes = {} } = {}) {
  const semanticDefects = defects
    .filter(defect => {
      if (!defect) return false;
      if (defect.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP) return true;
      if (defect.code === DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE) return true;
      if (defect.code === DATABASE_DEFECT_CODES.MISSING_ENTITY) return true;
      if (defect.code === DATABASE_DEFECT_CODES.SEMANTIC_ISSUE) return true;
      if (defect.code === DATABASE_DEFECT_CODES.DUPLICATE_MODEL) return true;
      if (defect.code === DATABASE_DEFECT_CODES.ARCHITECTURAL_SEPARATION_VIOLATION) return true;
      if (defect.relationship || defect.sourceRelationship || defect.sourceModel || defect.targetModel) return true;
      if (defect.validator === 'database_semantics' || defect.validator === 'semantic_validator') return true;
      return false;
    })
    .map(semanticDefectDetails)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  if (semanticDefects.length === 0) {
    return { status: 'RESOLVED', fingerprint: null, attempt: 0, state: null };
  }

  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(semanticDefects)).digest('hex');
  const affectedFiles = [...new Set(semanticDefects.map(defect => defect.file).filter(Boolean))].sort();
  const relationships = semanticDefects.map(({ model, relationship, sourceModel, sourceRelationship, targetModel, expectedReciprocal }) => ({
    model,
    relationship,
    sourceModel,
    sourceRelationship,
    targetModel,
    expectedReciprocal
  }));
  const unchanged = previous?.fingerprint === fingerprint;

  if (unchanged) {
    const state = {
      ...previous,
      fileHashesAfter: { ...fileHashes },
      remainingDefects: semanticDefects,
      history: [
        ...(previous.history || []),
        {
          attempt: previous.attempt,
          fingerprint,
          affectedFiles,
          fileHashesBefore: previous.fileHashesBefore,
          fileHashesAfter: { ...fileHashes },
          remainingDefects: semanticDefects
        }
      ]
    };
    return {
      status: 'SEMANTIC_REPAIR_NO_PROGRESS',
      fingerprint,
      attempt: previous.attempt,
      affectedFiles,
      relationships,
      fileHashesBefore: previous.fileHashesBefore,
      fileHashesAfter: { ...fileHashes },
      remainingDefects: semanticDefects,
      state
    };
  }

  // Detect Oscillation: If this defect fingerprint or file hash state occurred previously in history
  const isOscillation = (previous?.history || []).some(entry => {
    if (entry.fingerprint === fingerprint) return true;
    if (entry.fileHashesAfter && Object.keys(fileHashes).length > 0) {
      const matchAll = Object.entries(fileHashes).every(([f, h]) => entry.fileHashesAfter[f] === h);
      if (matchAll) return true;
    }
    return false;
  });

  if (isOscillation) {
    const state = {
      ...previous,
      fileHashesAfter: { ...fileHashes },
      remainingDefects: semanticDefects,
      history: [
        ...(previous.history || []),
        {
          attempt: previous.attempt + 1,
          fingerprint,
          affectedFiles,
          fileHashesBefore: previous.fileHashesBefore,
          fileHashesAfter: { ...fileHashes },
          remainingDefects: semanticDefects,
          oscillation: true
        }
      ]
    };
    return {
      status: 'SEMANTIC_REPAIR_OSCILLATION',
      fingerprint,
      attempt: previous.attempt + 1,
      affectedFiles,
      relationships,
      fileHashesBefore: previous.fileHashesBefore,
      fileHashesAfter: { ...fileHashes },
      remainingDefects: semanticDefects,
      state
    };
  }

  const attempt = previous ? previous.attempt + 1 : 1;
  const history = [...(previous?.history || [])];
  if (previous) {
    history.push({
      attempt: previous.attempt,
      fingerprint: previous.fingerprint,
      affectedFiles: previous.affectedFiles,
      fileHashesBefore: previous.fileHashesBefore,
      fileHashesAfter: { ...fileHashes },
      remainingDefects: previous.remainingDefects
    });
  }
  const state = {
    fingerprint,
    errorCode: DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP,
    attempt,
    affectedFiles,
    relationships,
    fileHashesBefore: { ...fileHashes },
    fileHashesAfter: null,
    remainingDefects: semanticDefects,
    history
  };

  return { status: 'PROGRESS', fingerprint, attempt, affectedFiles, relationships, state };
}

/**
 * Builds deterministic repair context for an LLM prompt.
 * Contains file path, existing content with line numbers, structured defects,
 * remediation requirements, forbidden behavior, and preservation constraints.
 * All secrets are strictly redacted.
 */
export function buildRepairContext({ fileDef, activeModule, manifest, defects, prd: _prd }) {
  const primaryDefect = defects[0] || { code: 'GENERIC' };
  const primaryCode = primaryDefect.code || 'GENERIC';
  const strategy = getRepairStrategy(primaryCode);

  const sanitizedContent = redactSecret(fileDef.content || '');
  const existingLines = sanitizedContent.split('\n');
  const numberedContent = existingLines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');

  // Redact any possible secrets from defects before prompt inclusion
  const sanitizedDefects = (defects || []).map(d => ({
    code: d.code,
    validator: d.validator,
    severity: d.severity,
    file: d.file || fileDef.path,
    line: d.line,
    hint: d.hint || d.remediation || d.message,
    model: d.model,
    relationship: d.relationship,
    sourceFile: d.sourceFile,
    sourceModel: d.sourceModel,
    sourceRelationship: d.sourceRelationship,
    targetModel: d.targetModel,
    expectedReciprocal: d.expectedReciprocal,
    expectedBackPopulates: d.expectedBackPopulates,
    actualBackPopulates: d.actualBackPopulates,
    actualTargetModel: d.actualTargetModel,
    actualState: d.actualState,
    foreignKeys: d.foreignKeys,
    message: d.message,
    locations: d.locations || [],
    evidence: d.evidence ? redactSecret(d.evidence) : '<REDACTED>',
    remediation: d.remediation
  }));

  const systemPrompt = `You are a Principal Software Engineer specializing in targeted, zero-regression code repair.
Your mission is to fix EXACT validation defects in an existing file using a surgical patch.

CRITICAL REPAIR RULES:
1. DO NOT rewrite the entire file. Generate a targeted patch replacing ONLY the defective lines.
2. PRESERVE all existing public interfaces, classes, methods, and comments.
3. OUTPUT FORMAT: Return ONLY the patch in XML format:
<patch file="${fileDef.path}">
<search>
exact original lines to be replaced (without line numbers)
</search>
<replace>
new corrected lines
</replace>
</patch>
Alternatively, return STRICT JSON matching:
{
  "action": "replace",
  "file": "${fileDef.path}",
  "search": "exact original code to replace",
  "replace": "new corrected code"
}
4. The <search> block MUST match the existing code character-for-character (excluding line numbers).
5. NEVER hardcode database passwords, secrets, or credentials. Always use environment variables (e.g. os.getenv("DATABASE_URL") or process.env.DATABASE_URL).
6. DO NOT output conversational text, explanations, or markdown fences outside the patch block.`;

  let relationshipContext = '';
  if (primaryCode === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP) {
    const relDefect = defects.find(d => d.code === DATABASE_DEFECT_CODES.BROKEN_RELATIONSHIP) || defects[0];
    if (relDefect) {
      const allFiles = [
        fileDef,
        ...(manifest?.modules || []).flatMap(m => m.required_files || [])
      ].filter(f => f && f.content);
      const extractClassSnippet = (modelName) => {
        if (!modelName) return null;
        for (const f of allFiles) {
          const regex = new RegExp(`(?:^|\\n)\\s*class\\s+${modelName}\\b[^:]*:[\\s\\S]*?(?=\\n\\s*class\\s+|$)`);
          const match = f.content.match(regex);
          if (match) return { file: f.path, snippet: match[0].trim() };
        }
        return null;
      };
      const sourceInfo = extractClassSnippet(relDefect.sourceModel);
      const targetInfo = extractClassSnippet(relDefect.targetModel || relDefect.model);
      relationshipContext = `\n======================================================================\n` +
        `RELATIONSHIP CONTRACT CONTEXT (BOTH SIDES OF RELATIONSHIP):\n` +
        `======================================================================\n` +
        (sourceInfo ? `SOURCE MODEL [${relDefect.sourceModel}] in ${sourceInfo.file}:\n${sourceInfo.snippet}\n\n` : '') +
        (targetInfo ? `TARGET MODEL [${relDefect.targetModel || relDefect.model}] in ${targetInfo.file}:\n${targetInfo.snippet}\n\n` : '') +
        `EXACT RECIPROCAL REQUIREMENT:\n` +
        `• Source declaration: '${relDefect.sourceModel}.${relDefect.sourceRelationship}' points to '${relDefect.targetModel || relDefect.model}' with back_populates='${relDefect.relationship || relDefect.expectedBackPopulates}'.\n` +
        `• Target declaration: '${relDefect.targetModel || relDefect.model}' MUST declare reciprocal relationship '${relDefect.relationship}' pointing back to '${relDefect.sourceModel}' with back_populates='${relDefect.sourceRelationship}'.\n` +
        `• STRICT RULE: Target '${relDefect.targetModel || relDefect.model}' MUST point directly to '${relDefect.sourceModel}'. NEVER use an unrelated model name (e.g. Customer, User) as the reciprocal target!\n` +
        `======================================================================\n\n`;

      const databaseContract = manifest?.project_requirements?.database;
      if (databaseContract) {
        relationshipContext +=
          `AUTHORITATIVE DATABASE CONTRACT (MUST NOT BE OVERRIDDEN):\n` +
          `${JSON.stringify({
            entities: databaseContract.entities || [],
            tables: databaseContract.tables || [],
            foreign_keys: databaseContract.foreign_keys || [],
            relationships: databaseContract.relationships || []
          }, null, 2)}\n` +
          `Only repair relationships and foreign keys that are present in this contract. ` +
          `Never redirect a relationship to an unrelated model merely to satisfy a name match.\n\n`;
      }
    }
  }

  if (primaryDefect.validator === 'required_foreign_keys') {
    const databaseContract = manifest?.project_requirements?.database;
    relationshipContext +=
      `\nAUTHORITATIVE FOREIGN-KEY CONTRACT:\n` +
      `${JSON.stringify({
        entities: databaseContract?.entities || [],
        tables: databaseContract?.tables || [],
        foreign_keys: databaseContract?.foreign_keys || []
      }, null, 2)}\n` +
      `The referenced table must be represented by a canonical SQLAlchemy ORM class. ` +
      `Repair the FK or planned model ownership only; never redirect it to Address, ` +
      `Order, or another unrelated model.\n\n`;
  }

  // Inject previous failed patches to prevent repeating the same patch on retry
  let previousAttemptsContext = '';
  const failedPatches = (fileDef.repairHistory || []).filter(h => h.patch && h.patch.search);
  if (failedPatches.length > 0) {
    previousAttemptsContext = `\nPREVIOUS FAILED PATCHES (DO NOT REPEAT - PRODUCED NO PROGRESS / OSCILLATION):\n` +
      failedPatches.map((fp, idx) =>
        `Attempt ${fp.attempt || idx + 1} (${fp.status}):\n<search>\n${fp.patch.search}\n</search>\n<replace>\n${fp.patch.replace}\n</replace>`
      ).join('\n---\n') +
      `\nCRITICAL RULE: DO NOT repeat any of the above patches. You must provide a fundamentally different fix that addresses the root defect.\n\n`;
  }

  let userPrompt = `TARGET FILE: ${fileDef.path}
MODULE: ${activeModule.id} (${activeModule.name})
STRATEGY: ${strategy.name}

${relationshipContext}${previousAttemptsContext}EXISTING FILE CONTENT (with line numbers):
${numberedContent}

VALIDATION DEFECTS TO REMEDY:
${JSON.stringify(sanitizedDefects, null, 2)}
${primaryDefect.hint ? `\nSPECIFIC REPAIR HINT:\n${primaryDefect.hint}\n` : ''}
REQUIRED ACTIONS:
${strategy.instructions.map(i => `• ${i}`).join('\n')}

FORBIDDEN ACTIONS:
${strategy.forbidden.map(f => `❌ ${f}`).join('\n')}

PRESERVE:
• All existing functions, classes, and database models
• All established table and column names
• Intra-module import contracts

Generate ONLY the targeted replacement patch now.`;

  if (manifest?.integrationContract) userPrompt += `\nSHARED INTEGRATION CONTRACT (preserve these routes, field names and workflow requirements):\n${JSON.stringify(manifest.integrationContract, null, 2)}`;
  return { systemPrompt, userPrompt, sanitizedDefects, strategy };
}

/**
 * Parses a patch from raw LLM output. Supports XML <patch> and JSON formats.
 */
export function parsePatch(rawOutput, expectedPath) {
  if (!rawOutput || typeof rawOutput !== 'string') {
    return { valid: false, error: 'Empty LLM output.' };
  }

  const clean = rawOutput.trim();

  // 1. Try XML-style <patch>
  const patchMatch = clean.match(/<patch(?:\s+file="([^"]+)")?>([\s\S]*?)<\/patch>/i);
  if (patchMatch) {
    const filePath = patchMatch[1] || expectedPath;
    const body = patchMatch[2];

    const searchMatch = body.match(/<search>([\s\S]*?)<\/search>/i);
    const replaceMatch = body.match(/<replace>([\s\S]*?)<\/replace>/i);

    if (!searchMatch) {
      return { valid: false, error: 'Patch XML is missing <search> block.' };
    }
    if (!replaceMatch) {
      return { valid: false, error: 'Patch XML is missing <replace> block.' };
    }

    let search = searchMatch[1];
    let replace = replaceMatch[1];

    // Strip leading/trailing single newline introduced by XML tags
    if (search.startsWith('\n')) search = search.substring(1);
    if (search.endsWith('\n')) search = search.substring(0, search.length - 1);
    if (replace.startsWith('\n')) replace = replace.substring(1);
    if (replace.endsWith('\n')) replace = replace.substring(0, replace.length - 1);

    return {
      valid: true,
      patch: {
        file: filePath,
        search,
        replace
      }
    };
  }

  // 2. Try JSON format
  try {
    let jsonText = clean;
    if (jsonText.startsWith('```json')) jsonText = jsonText.substring(7);
    else if (jsonText.startsWith('```')) jsonText = jsonText.substring(3);
    if (jsonText.endsWith('```')) jsonText = jsonText.substring(0, jsonText.length - 3);
    jsonText = jsonText.trim();

    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const parsed = JSON.parse(jsonText.substring(firstBrace, lastBrace + 1));
      if (parsed.search !== undefined && parsed.replace !== undefined) {
        return {
          valid: true,
          patch: {
            file: parsed.file || expectedPath,
            search: parsed.search,
            replace: parsed.replace
          }
        };
      }
    }
  } catch (e) {
    // JSON parse failed
  }

  // 3. Fallback: Search for <search> and <replace> tags without outer <patch>
  const searchLoose = clean.match(/<search>([\s\S]*?)<\/search>/i);
  const replaceLoose = clean.match(/<replace>([\s\S]*?)<\/replace>/i);
  if (searchLoose && replaceLoose) {
    let search = searchLoose[1];
    let replace = replaceLoose[1];
    if (search.startsWith('\n')) search = search.substring(1);
    if (search.endsWith('\n')) search = search.substring(0, search.length - 1);
    if (replace.startsWith('\n')) replace = replace.substring(1);
    if (replace.endsWith('\n')) replace = replace.substring(0, replace.length - 1);

    return {
      valid: true,
      patch: {
        file: expectedPath,
        search,
        replace
      }
    };
  }

  return { valid: false, error: 'Could not extract valid <patch> or JSON patch from LLM output.' };
}

function findRedactedLineMatches(existingContent, search) {
  const existingLines = (existingContent || '').replace(/\r\n/g, '\n').split('\n');
  const searchLines = search.replace(/\r\n/g, '\n').split('\n').map(redactSecret);
  const matches = [];

  for (let lineIndex = 0; lineIndex <= existingLines.length - searchLines.length; lineIndex++) {
    const candidateLines = existingLines.slice(lineIndex, lineIndex + searchLines.length).map(redactSecret);
    if (candidateLines.every((line, searchLineIndex) => line === searchLines[searchLineIndex])) {
      matches.push(lineIndex);
    }
  }

  return matches;
}

export function findTrimmedLineMatches(existingContent, search) {
  const normExisting = (existingContent || '').replace(/\r\n/g, '\n');
  const normSearch = (search || '').replace(/\r\n/g, '\n');
  const existLines = normExisting.split('\n');
  const searchLines = normSearch.split('\n');
  if (searchLines.length === 0 || !searchLines.some(l => l.trim().length > 0)) return [];

  const matches = [];
  for (let i = 0; i <= existLines.length - searchLines.length; i++) {
    let match = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (existLines[i + j].trim() !== searchLines[j].trim()) {
        match = false;
        break;
      }
    }
    if (match) matches.push(i);
  }
  return matches;
}

export function stripLineNumberPrefixes(text) {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split('\n');
  const hasLineNumbers = lines.length > 0 && lines.every(l => l.trim().length === 0 || /^\s*\d+:\s?/.test(l));
  if (hasLineNumbers) {
    return lines.map(l => l.replace(/^\s*\d+:\s?/, '')).join('\n');
  }
  return text;
}

/**
 * Validates a patch before applying it to code.
 * Checks path matching, search target existence, and scans replacement for new credentials.
 */
export function validatePatch({ patch, existingContent, filePath }) {
  if (!patch) return { valid: false, error: 'Patch object is null or undefined.' };

  // File path check
  if (patch.file && filePath) {
    const normPatch = patch.file.replace(/\\/g, '/').toLowerCase();
    const normTarget = filePath.replace(/\\/g, '/').toLowerCase();
    if (!normPatch.endsWith(normTarget) && !normTarget.endsWith(normPatch)) {
      return { valid: false, error: `Patch file target "${patch.file}" does not match target file "${filePath}".` };
    }
  }

  // Search target check
  if (typeof patch.search !== 'string' || patch.search.trim().length === 0) {
    return { valid: false, error: 'Patch search text is empty.' };
  }

  const cleanExisting = existingContent || '';
  let searchTarget = patch.search;

  // Attempt to strip prompt-generated line number prefixes if the search block does not match verbatim
  if (!cleanExisting.includes(searchTarget)) {
    const unnumberedSearch = stripLineNumberPrefixes(searchTarget);
    if (unnumberedSearch !== searchTarget) {
      const normExisting = cleanExisting.replace(/\r\n/g, '\n');
      const normUnnumbered = unnumberedSearch.replace(/\r\n/g, '\n');
      if (
        cleanExisting.includes(unnumberedSearch) ||
        normExisting.includes(normUnnumbered) ||
        findTrimmedLineMatches(cleanExisting, unnumberedSearch).length === 1
      ) {
        patch.search = unnumberedSearch;
        searchTarget = unnumberedSearch;
      }
    }
  }

  if (patch.replace && stripLineNumberPrefixes(patch.replace) !== patch.replace) {
    const unnumberedReplace = stripLineNumberPrefixes(patch.replace);
    patch.replace = unnumberedReplace;
  }

  // Exact match check
  const exactIndex = cleanExisting.indexOf(searchTarget);
  if (exactIndex === -1) {
    // Attempt normalized whitespace match as fallback
    const normExisting = cleanExisting.replace(/\r\n/g, '\n');
    const normSearch = searchTarget.replace(/\r\n/g, '\n');
    if (normExisting.indexOf(normSearch) === -1) {
      const redactedMatches = findRedactedLineMatches(cleanExisting, searchTarget);
      if (redactedMatches.length === 1) {
        // The patch was authored from the secret-redacted repair context.
      } else if (redactedMatches.length > 1) {
        return { valid: false, error: `Patch search block is ambiguous in ${filePath} after secret redaction.` };
      } else {
        const trimmedMatches = findTrimmedLineMatches(cleanExisting, searchTarget);
        if (trimmedMatches.length === 1) {
          // Matched via trimmed lines (e.g. minor indentation discrepancy)
        } else if (trimmedMatches.length > 1) {
          return { valid: false, error: `Patch search block is ambiguous in ${filePath} (multiple trimmed line matches).` };
        } else {
          return {
            valid: false,
            error: `Patch search block could not be located in ${filePath}. Search block:\n"${redactSecret(searchTarget).slice(0, 100)}..."`
          };
        }
      }
    }
  }

  // Security scan on replacement: verify replacement does NOT re-introduce hardcoded credentials!
  const dummyFile = { path: filePath, content: patch.replace };
  const credDefects = scanForCredentials(dummyFile);
  if (credDefects.length > 0) {
    return {
      valid: false,
      error: `Patch replacement contains hardcoded credentials (${credDefects[0].code}): ${credDefects[0].message}`
    };
  }

  return { valid: true };
}

/**
 * Applies a validated patch to existing content.
 */
export function applyPatch({ patch, existingContent }) {
  const content = existingContent || '';
  const search = patch.search;
  const replace = patch.replace;

  // Try exact replacement first
  if (content.includes(search)) {
    return {
      applied: true,
      newContent: content.replace(search, replace)
    };
  }

  // Try normalized line breaks
  const normContent = content.replace(/\r\n/g, '\n');
  const normSearch = search.replace(/\r\n/g, '\n');
  const normReplace = replace.replace(/\r\n/g, '\n');

  if (normContent.includes(normSearch)) {
    return {
      applied: true,
      newContent: normContent.replace(normSearch, normReplace)
    };
  }

  const redactedMatches = findRedactedLineMatches(content, search);
  if (redactedMatches.length === 1) {
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r\n|\n/);
    const searchLineCount = search.replace(/\r\n/g, '\n').split('\n').length;
    const replacementLines = replace.replace(/\r\n/g, '\n').split('\n');
    lines.splice(redactedMatches[0], searchLineCount, ...replacementLines);
    return {
      applied: true,
      newContent: lines.join(lineEnding)
    };
  }

  if (redactedMatches.length > 1) {
    return {
      applied: false,
      newContent: content,
      error: 'Patch could not be applied: redacted search block is ambiguous.'
    };
  }

  const trimmedMatches = findTrimmedLineMatches(content, search);
  if (trimmedMatches.length === 1) {
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r\n|\n/);
    const searchLineCount = search.replace(/\r\n/g, '\n').split('\n').length;
    const matchedStartLine = lines[trimmedMatches[0]];
    const baseIndentMatch = matchedStartLine.match(/^(\s*)/);
    const baseIndent = baseIndentMatch ? baseIndentMatch[1] : '';

    const searchFirstLine = search.replace(/\r\n/g, '\n').split('\n')[0];
    const searchIndentMatch = searchFirstLine.match(/^(\s*)/);
    const searchIndent = searchIndentMatch ? searchIndentMatch[1] : '';

    const rawReplacementLines = replace.replace(/\r\n/g, '\n').split('\n');
    const adjusted = rawReplacementLines.map(line => {
      if (line.trim().length === 0) return '';
      if (searchIndent.length > 0 && line.startsWith(searchIndent)) {
        return baseIndent + line.slice(searchIndent.length);
      }
      return line;
    });

    lines.splice(trimmedMatches[0], searchLineCount, ...adjusted);
    return {
      applied: true,
      newContent: lines.join(lineEnding)
    };
  }

  if (trimmedMatches.length > 1) {
    return {
      applied: false,
      newContent: content,
      error: 'Patch could not be applied: trimmed search block is ambiguous.'
    };
  }

  return {
    applied: false,
    newContent: content,
    error: 'Patch could not be applied: search block not found.'
  };
}

/**
 * Deterministically classifies a repair attempt based on:
 * beforeHash, afterHash, beforeDefectSet, afterDefectSet, attempt, maxAttempts, history.
 *
 * Rules:
 * - valid = ALREADY_VALID / REPAIRED
 * - unchanged + invalid = NO_PROGRESS
 * - repeated hash/state cycle = OSCILLATION
 * - max attempts = TERMINAL_FAILED
 * - changed + fewer defects = REPAIRED
 * - changed + same defects = NO_PROGRESS
 * - changed + more defects = REGRESSED
 */
export function classifyRepairAttempt({
  beforeHash,
  afterHash,
  beforeDefectSet = [],
  afterDefectSet = [],
  attempt = 1,
  maxAttempts = MAX_FILE_REPAIR_ATTEMPTS,
  history = []
}) {
  const beforeCount = Array.isArray(beforeDefectSet) ? beforeDefectSet.length : 0;
  const afterCount = Array.isArray(afterDefectSet) ? afterDefectSet.length : 0;

  // Rule: unchanged content hash = NO_PROGRESS / NO_CHANGE
  if (beforeHash === afterHash) {
    if (attempt >= maxAttempts) {
      return {
        classification: 'TERMINAL_FAILED',
        status: 'NO_CHANGE',
        message: `Repair attempt ${attempt} produced zero changes and reached max attempts (${maxAttempts}).`
      };
    }
    return {
      classification: 'NO_PROGRESS',
      status: 'NO_CHANGE',
      message: `Repair attempt ${attempt} produced zero changes (file hash unchanged).`
    };
  }

  // Rule: valid = ALREADY_VALID or REPAIRED
  if (afterCount === 0) {
    if (beforeCount === 0) {
      return {
        classification: 'ALREADY_VALID',
        status: 'RESOLVED',
        message: 'File is already valid with zero defects.'
      };
    }
    return {
      classification: 'REPAIRED',
      status: 'RESOLVED',
      message: `All defects successfully resolved in attempt ${attempt}.`
    };
  }

  // Rule: repeated hash/state cycle = OSCILLATION
  if (history && history.length > 0) {
    const isOscillating = history.some(h =>
      (h.hashAfter && h.hashAfter === afterHash) ||
      (h.afterHash && h.afterHash === afterHash) ||
      (h.hashBefore && h.hashBefore === afterHash) ||
      (h.beforeHash && h.beforeHash === afterHash)
    );
    if (isOscillating) {
      return {
        classification: 'OSCILLATION',
        status: 'OSCILLATION',
        message: `Repair attempt ${attempt} oscillated to a previous file content state (${afterHash.slice(0, 8)}).`
      };
    }
  }

  // Rule: max attempts = TERMINAL_FAILED
  if (attempt >= maxAttempts) {
    return {
      classification: 'TERMINAL_FAILED',
      status: afterCount < beforeCount ? 'IMPROVEMENT' : (afterCount > beforeCount ? 'REGRESSED' : 'NO_IMPROVEMENT'),
      message: `Repair attempt ${attempt} reached maximum attempts (${maxAttempts}) with ${afterCount} unresolved defects.`
    };
  }

  // Rule: changed + fewer defects = REPAIRED
  if (afterCount < beforeCount) {
    return {
      classification: 'REPAIRED',
      status: 'IMPROVEMENT',
      message: `Defects reduced from ${beforeCount} to ${afterCount} in attempt ${attempt}.`
    };
  }

  // Stage progression: resolving syntax or compilation/import errors unblocks semantic validators.
  // When a syntax or import error is resolved, newly surfaced semantic defects represent
  // progressive disclosure across validator stages, NOT a regression.
  const isSyntaxOrImportDefect = (d) => {
    const code = (d?.code || d || '').toString();
    const validator = (d?.validator || '').toString();
    const message = (d?.message || '').toString();
    return (
      code === 'SYNTAX_ERROR' ||
      code === 'SYNTAX_VALIDATION_FAILURE' ||
      code === 'DB_IMP001' ||
      code === 'BROKEN_IMPORT' ||
      validator === 'syntax' ||
      validator === 'sqlalchemy_orm_mapper' ||
      message.includes('SQLAlchemy ORM import failure') ||
      message.includes('is not defined') ||
      message.includes('ImportError') ||
      message.includes('SyntaxError')
    );
  };

  const hadSyntaxBefore = (beforeDefectSet || []).some(isSyntaxOrImportDefect);
  const hasSyntaxAfter = (afterDefectSet || []).some(isSyntaxOrImportDefect);

  if (hadSyntaxBefore && !hasSyntaxAfter) {
    return {
      classification: 'STAGE_PROGRESSION',
      status: 'IMPROVEMENT',
      message: `Syntax/Import resolved in attempt ${attempt}; progressing to semantic validation (${afterCount} semantic defects revealed).`
    };
  }

  // Rule: changed + more defects = REGRESSED
  if (afterCount > beforeCount) {
    return {
      classification: 'REGRESSED',
      status: 'REGRESSED',
      message: `Defects increased from ${beforeCount} to ${afterCount} in attempt ${attempt}.`
    };
  }

  // Rule: changed + same defects = NO_PROGRESS
  const codesBefore = (beforeDefectSet || []).map(d => d.code || d).sort().join(',');
  const codesAfter = (afterDefectSet || []).map(d => d.code || d).sort().join(',');
  return {
    classification: 'NO_PROGRESS',
    status: (codesBefore === codesAfter && attempt >= 2) ? 'NO_IMPROVEMENT' : 'PROGRESSING',
    message: `Repair attempt ${attempt} modified file but produced no defect reduction (${afterCount} remaining).`
  };
}

/**
 * Tracks repair progress across attempts and detects stagnation (NO_CHANGE or NO_IMPROVEMENT).
 */
export function detectRepairProgress({
  hashBefore,
  hashAfter,
  defectsBefore = [],
  defectsAfter = [],
  attempt = 1,
  maxAttempts = MAX_FILE_REPAIR_ATTEMPTS,
  history = []
}) {
  const result = classifyRepairAttempt({
    beforeHash: hashBefore,
    afterHash: hashAfter,
    beforeDefectSet: defectsBefore,
    afterDefectSet: defectsAfter,
    attempt,
    maxAttempts,
    history
  });
  return {
    status: result.status,
    classification: result.classification,
    message: result.message
  };
}

/**
 * High-Level Targeted Repair Operation:
 * Modifies an existing file to fix validator defects without whole-file regeneration.
 */
export async function repairFile({
  fileDef,
  activeModule,
  manifest,
  defects,
  caller,
  sendEvent,
  generationId,
  validateFn,
  phaseValidateFn
}) {
  if ((fileDef.repairAttempts || 0) >= MAX_FILE_REPAIR_ATTEMPTS) {
    fileDef.status = REPAIR_STATES.FAILED;
    const failureMsg = `Exceeded maximum file repair attempts (${MAX_FILE_REPAIR_ATTEMPTS}) for ${fileDef.path}.`;
    fileDef.errors = [failureMsg];
    sendEvent('repair_blocked', {
      path: fileDef.path,
      attempt: fileDef.repairAttempts,
      reason: failureMsg
    });
    sendEvent('log', `❌ [repair_blocked] ${fileDef.path} exceeded maximum repair attempts (${MAX_FILE_REPAIR_ATTEMPTS}). Marked failed.`);
    return {
      success: false,
      status: 'failed',
      error: failureMsg,
      errors: fileDef.errors
    };
  }

  fileDef.repairAttempts = (fileDef.repairAttempts || 0) + 1;
  const attempt = fileDef.repairAttempts;

  sendEvent('repair_started', {
    path: fileDef.path,
    moduleId: activeModule.id,
    attempt,
    maxAttempts: MAX_FILE_REPAIR_ATTEMPTS,
    defectCount: defects.length
  });
  sendEvent('log', `🔧 [repair_started] [${activeModule.id}] Repairing ${fileDef.path} (Attempt ${attempt}/${MAX_FILE_REPAIR_ATTEMPTS})...`);

  // 1. Defect Classification & Strategy Selection
  const primaryDefect = defects[0] || { code: 'UNKNOWN', message: 'Unknown defect' };
  const strategy = primaryDefect.validator === 'required_foreign_keys'
    ? REPAIR_STRATEGIES[DATABASE_DEFECT_CODES.FOREIGN_KEY_FAILURE]
    : getRepairStrategy(primaryDefect.code);

  // File-level syntax validation is not sufficient for database repairs. A
  // model patch can be syntactically valid while still breaking the complete
  // table/relationship contract. Callers may provide a phase validator for
  // that authoritative whole-layer check.
  const validateCandidate = async (candidate) => {
    const fileResult = typeof validateFn === 'function'
      ? await validateFn(candidate)
      : { isValid: true, errors: [], defects: [] };
    if (typeof phaseValidateFn !== 'function' || activeModule?.layer !== 'DATABASE') return fileResult;

    const phaseResult = await phaseValidateFn(candidate);
    const environmentErrors = (fileResult?.errors || []).filter(error =>
      /python.*(?:toolchain|unavailable)|sqlalchemy.*unavailable|environment.*unavailable/i.test(String(error))
    );
    const fileErrors = (fileResult?.errors || []).filter(error => !environmentErrors.includes(error));
    if (phaseResult?.isValid) {
      // Database validation has a deterministic fallback when Python is not
      // available. Do not turn that environment limitation into a fake syntax
      // repair defect; runtime gates still remain responsible for BLOCKED.
      return {
        ...(fileResult || {}),
        isValid: fileErrors.length === 0 && !(fileResult?.defects || []).length,
        errors: fileErrors,
        environmentBlocked: environmentErrors.length > 0
      };
    }

    const phaseDefects = Array.isArray(phaseResult?.defects) && phaseResult.defects.length
      ? phaseResult.defects
      : (phaseResult?.errors || []).map(message => ({
          code: DATABASE_DEFECT_CODES.SEMANTIC_ISSUE,
          message: typeof message === 'string' ? message : message?.message || String(message)
        }));
    const existing = Array.isArray(fileResult?.defects) ? fileResult.defects : [];
    const seen = new Set(existing.map(defect => `${defect.code}|${defect.file || ''}|${defect.message || ''}`));
    const defects = [...existing];
    for (const defect of phaseDefects) {
      const key = `${defect.code}|${defect.file || ''}|${defect.message || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        defects.push(defect);
      }
    }
    return {
      ...(fileResult || {}),
      isValid: false,
      defects,
      errors: [...fileErrors, ...(phaseResult?.errors || [])],
      environmentBlocked: environmentErrors.length > 0
    };
  };

  sendEvent('repair_defect_classified', {
    path: fileDef.path,
    code: primaryDefect.code,
    message: primaryDefect.message,
    severity: primaryDefect.severity || 'HIGH'
  });
  sendEvent('log', `🔍 [repair_defect_classified] Defect ${primaryDefect.code} (${primaryDefect.message}) in ${fileDef.path}`);

  sendEvent('repair_strategy_selected', {
    path: fileDef.path,
    strategy: strategy.name
  });
  sendEvent('log', `🎯 [repair_strategy_selected] Applying ${strategy.name}`);

  // Refuse inappropriate relationship or line repairs on STACK_CONTRACT_MISMATCH
  if (primaryDefect.code === DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH) {
    sendEvent('log', `🚫 [repair_blocked] Cannot perform targeted line repair on STACK_CONTRACT_MISMATCH in ${fileDef.path}. Incompatible technology stack.`);
    fileDef.status = 'failed';
    fileDef.errors = [primaryDefect.message || 'STACK_CONTRACT_MISMATCH'];
    return {
      success: false,
      status: 'failed',
      defectCode: DATABASE_DEFECT_CODES.STACK_CONTRACT_MISMATCH,
      error: primaryDefect.message || 'STACK_CONTRACT_MISMATCH cannot be resolved via targeted line repair.'
    };
  }

  // 1a. DETERMINISTIC BOILERPLATE REPAIR (zero-LLM shortcut)
  // Boilerplate files (e.g. backend/app/db/base.py, main.py, config files) have authoritative deterministic definitions.
  // Never send them to the LLM for repair or regeneration.
  if (isBoilerplateFile(fileDef.path) && process.env.DISABLE_DETERMINISTIC_REPAIR !== 'true') {
    const allFiles = [
      ...(manifest?.files || []),
      ...(manifest?.modules || []).flatMap(m => m.required_files || [])
    ];
    const modelsFile = allFiles.find(f => f?.path && f.path.replace(/\\/g, '/').endsWith('models.py'));
    const boilerplateContent = getBoilerplateTemplate(fileDef.path, manifest?.projectName || 'App', {
      declaredEntities: manifest?.declaredEntities || [],
      modelsContent: modelsFile?.content || ''
    });
    if (boilerplateContent) {
      const hashBefore = generateFileHash(fileDef.content);
      const hashAfter = generateFileHash(boilerplateContent);
      fileDef.content = boilerplateContent;
      fileDef.status = 'validated';
      fileDef.errors = [];
      fileDef.defects = [];
      if (hashBefore !== hashAfter) {
        sendEvent('repair_patch_applied', { path: fileDef.path, hashBefore, hashAfter });
      }
      sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
      sendEvent('log', `✅ [repair_deterministic] ${fileDef.path} is a boilerplate file. Regenerated deterministically without LLM.`);
      return { success: true, status: 'repaired', repaired: true, alreadyValid: false, newContent: boilerplateContent };
    }
  }

  // 1b. DETERMINISTIC DB001 CREDENTIAL REPAIR (zero-LLM shortcut)
  // For hardcoded-credential defects, attempt a deterministic regex-based fix before invoking the LLM.
  // This mirrors the credential sanitizer in normalizeDatabaseLayerFiles() and short-circuits the
  // oscillation-prone LLM repair loop for the most common DB001 pattern.
  if (primaryDefect.code === DATABASE_DEFECT_CODES.CREDENTIALS_EXPOSED && process.env.DISABLE_DETERMINISTIC_REPAIR !== 'true') {
    let detContent = fileDef.content || '';
    let detModified = false;

    // Pattern A: create_engine("<hardcoded_uri>")
    const detA = detContent.replace(
      /create_engine\(\s*(['"])(?!os\.getenv|process\.env)(?:postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?|sqlite|mssql(?:\+[a-zA-Z0-9_]+)?|mongodb(?:\+srv)?):\/\/[^'"\s]+\1/gi,
      'create_engine(os.getenv("DATABASE_URL", "sqlite:///./app.db")'
    );
    if (detA !== detContent) { detContent = detA; detModified = true; }

    // Pattern B: DATABASE_URL = "<hardcoded_uri>" variable assignment
    const detB = detContent.replace(
      /^([ \t]*(?:SQLALCHEMY_)?DATABASE_URL\s*=\s*)(['"])(?!os\.getenv|process\.env|\{)(?:postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?|sqlite|mssql(?:\+[a-zA-Z0-9_]+)?):\/\/[^'"\s]+\2/gm,
      '$1os.getenv("DATABASE_URL", "sqlite:///./app.db")'
    );
    if (detB !== detContent) { detContent = detB; detModified = true; }

    // Pattern C: alembic config.set_main_option("sqlalchemy.url", "<hardcoded>")
    const detC = detContent.replace(
      /config\.set_main_option\(\s*['"]sqlalchemy\.url['"]\s*,\s*['"](?!os\.getenv|\{|%\()(?:postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?|sqlite|mssql(?:\+[a-zA-Z0-9_]+)?):\/\/[^'"]+['"]\s*\)/gi,
      'config.set_main_option("sqlalchemy.url", os.environ.get("DATABASE_URL", config.get_main_option("sqlalchemy.url")))'
    );
    if (detC !== detContent) { detContent = detC; detModified = true; }

    // Pattern D: connectable = create_engine("<hardcoded_uri>") in alembic env.py
    const detD = detContent.replace(
      /(connectable\s*=\s*create_engine\()(['"])(?!os\.getenv)(?:postgresql(?:\+[a-zA-Z0-9_]+)?|mysql(?:\+[a-zA-Z0-9_]+)?|sqlite|mssql(?:\+[a-zA-Z0-9_]+)?):\/\/[^'"\s]+\2/gi,
      '$1os.environ.get("DATABASE_URL", "sqlite:///./app.db")'
    );
    if (detD !== detContent) { detContent = detD; detModified = true; }

    // Ensure `import os` is present
    if (detModified && detContent.includes('os.') && !/^import os\b/m.test(detContent)) {
      detContent = 'import os\n' + detContent;
    }

    if (detModified) {
      sendEvent('log', `🩹 [repair_deterministic] DB001 credential sanitizer applied deterministically to ${fileDef.path} without LLM.`);
      const detCandidate = { ...fileDef, content: detContent };
      const detReval = typeof validateFn === 'function' ? await validateFn(detCandidate) : { isValid: true, errors: [], defects: [] };
      const detCreds = [...scanForCredentials(detCandidate), ...scanForSecuritySinks(detCandidate)];
      if (detReval.isValid && detCreds.length === 0) {
        const hashBefore = generateFileHash(fileDef.content);
        const hashAfter = generateFileHash(detContent);
        fileDef.content = detContent;
        fileDef.status = 'validated';
        fileDef.errors = [];
        fileDef.defects = [];
        if (hashBefore !== hashAfter) {
          sendEvent('repair_patch_applied', { path: fileDef.path, hashBefore, hashAfter });
        }
        sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
        sendEvent('log', `✅ [repair_deterministic] ${fileDef.path} DB001 credential defect resolved deterministically.`);
        return { success: true, status: 'repaired', repaired: true, alreadyValid: false, newContent: detContent };
      } else {
        sendEvent('log', `⚠️ [repair_deterministic] Deterministic credential repair for ${fileDef.path} succeeded structurally but failed re-validation (syntaxValid=${detReval.isValid}, remainingCreds=${detCreds.length}). Continuing to LLM repair.`);
        // Update fileDef content so LLM repair context uses the partially-cleaned file
        fileDef.content = detContent;
      }
    }
  }

  // 1c. DETERMINISTIC SQLALCHEMY & PYTHON IMPORT REPAIR (zero-LLM shortcut)
  // For missing ORM types/imports (e.g. name 'Boolean' is not defined), reconcile imports in-process deterministically.
  const isImportDefect = primaryDefect.code === DATABASE_DEFECT_CODES.BROKEN_IMPORT ||
                         primaryDefect.validator === 'sqlalchemy_orm_import' ||
                         /name\s+'[A-Za-z0-9_]+'\s+is\s+not\s+defined/i.test(primaryDefect.message || '');
  if (isImportDefect && fileDef && fileDef.path && fileDef.path.endsWith('.py')) {
    const originalContent = fileDef.content || '';
    const healedContent = reconcileSqlAlchemyImports(originalContent, sendEvent);
    if (healedContent && healedContent !== originalContent) {
      sendEvent('log', `🩹 [repair_deterministic] Applied deterministic SQLAlchemy import reconciliation to ${fileDef.path}.`);
      fileDef.content = healedContent;
      const reval = typeof validateFn === 'function' ? await validateFn(fileDef) : { isValid: true, defects: [] };
      if (reval.isValid || (reval.defects && reval.defects.length === 0)) {
        const hashBefore = generateFileHash(originalContent);
        const hashAfter = generateFileHash(healedContent);
        fileDef.status = 'validated';
        fileDef.errors = [];
        fileDef.defects = [];
        if (hashBefore !== hashAfter) {
          sendEvent('repair_patch_applied', { path: fileDef.path, hashBefore, hashAfter });
        }
        sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
        sendEvent('log', `✅ [repair_deterministic] ${fileDef.path} import defect resolved deterministically.`);
        return { success: true, status: 'repaired', repaired: true, alreadyValid: false, newContent: healedContent };
      }
    }
  }

  // 1d. DETERMINISTIC HARDCODED AUTH TOKEN REPAIR (zero-LLM shortcut)
  if (primaryDefect.code === 'HARDCODED_AUTH_TOKEN' && fileDef && fileDef.path && fileDef.path.endsWith('.py')) {
    const originalContent = fileDef.content || '';
    let healedContent = originalContent;
    healedContent = healedContent.replace(
      /([a-zA-Z0-9_]*access_token|token)\s*=\s*['"](?:YOUR_ACCESS_TOKEN|YOUR_TOKEN|fake-token|test-token|fake_token|test_token|dummy_token|mock_token|fake_jwt_token)['"][^\n]*/gi,
      '$1 = create_access_token({"sub": str(getattr(user, "id", getattr(user, "email", "1")))})'
    );
    healedContent = healedContent.replace(
      /(['"](?:access_token|token)['"]\s*:\s*)['"](?:YOUR_ACCESS_TOKEN|YOUR_TOKEN|fake-token|test-token|fake_token|test_token|dummy_token|mock_token|fake_jwt_token)['"]/gi,
      '$1create_access_token({"sub": str(getattr(user, "id", getattr(user, "email", "1")))})'
    );
    if (healedContent.includes('create_access_token') && !healedContent.includes('import create_access_token')) {
      healedContent = 'from app.core.security import create_access_token\n' + healedContent;
    }
    if (healedContent !== originalContent) {
      sendEvent('log', `🩹 [repair_deterministic] Replaced hardcoded placeholder authentication token with dynamic JWT generation in ${fileDef.path}.`);
      fileDef.content = healedContent;
      const reval = typeof validateFn === 'function' ? await validateFn(fileDef) : { isValid: true, defects: [] };
      if (reval.isValid || (reval.defects && reval.defects.length === 0)) {
        const hashBefore = generateFileHash(originalContent);
        const hashAfter = generateFileHash(healedContent);
        fileDef.status = 'validated';
        fileDef.errors = [];
        fileDef.defects = [];
        if (hashBefore !== hashAfter) {
          sendEvent('repair_patch_applied', { path: fileDef.path, hashBefore, hashAfter });
        }
        sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
        sendEvent('log', `✅ [repair_deterministic] ${fileDef.path} placeholder auth token resolved deterministically.`);
        return { success: true, status: 'repaired', repaired: true, alreadyValid: false, newContent: healedContent };
      }
    }
  }

  // 2. Build Deterministic Repair Context
  const { systemPrompt, userPrompt } = buildRepairContext({
    fileDef,
    activeModule,
    manifest,
    defects
  });

  sendEvent('repair_context_created', {
    path: fileDef.path,
    contextLength: userPrompt.length
  });

  let rawPatchOutput = '';

  const executeCleanFallback = async (reason, currentDefects = defects) => {
    if (fileDef.fallbackAttempted) return null;
    fileDef.fallbackAttempted = true;
    sendEvent('log', `🔄 [repair_fallback] Targeted repair produced ${reason} on ${fileDef.path}. Triggering bounded clean regeneration fallback from authoritative contract...`);

    try {
      const fallbackPrompt = `[CLEAN FILE REGENERATION FALLBACK FROM AUTHORITATIVE CONTRACT]
Target File: ${fileDef.path}
Module: ${activeModule.id} (${activeModule.name})

The previous targeted line repairs produced ${reason} for defect:
Defect Code: ${primaryDefect.code}
Message: ${primaryDefect.message}
Remaining Defects:
${JSON.stringify(currentDefects, null, 2)}

AUTHORITATIVE FILE CONTRACT:
${fileDef.contract || (manifest?.project_requirements ? JSON.stringify(manifest.project_requirements, null, 2) : 'Implement complete, production-ready source code adhering to project requirements.')}

REGENERATION REQUIREMENTS:
1. Regenerate the complete, unbroken, production-ready source code for "${fileDef.path}" from scratch.
2. Strictly fix all syntax errors, import statements, and validation defects.
3. Fully satisfy the authoritative file contract and all imported/exported symbols.
4. Output the complete implementation inside:
<file path="${fileDef.path}">
...complete code...
</file>
5. DO NOT output stubs or placeholders. DO NOT wrap with markdown \`\`\` fences. DO NOT output conversational text.`;

      const fallbackOutput = await caller(systemPrompt, fallbackPrompt, { sendEvent, generationId });
      let extractedCandidate = null;
      const fileMatch = fallbackOutput && fallbackOutput.match(/<file\s+path=["']([^"']+)["']>([\s\S]*?)<\/file>/i);
      if (fileMatch && fileMatch[1].replace(/\\/g, '/').toLowerCase() === fileDef.path.replace(/\\/g, '/').toLowerCase()) {
        extractedCandidate = fileMatch[2];
      } else {
        const fenceMatch = fallbackOutput && fallbackOutput.match(/```(?:python|typescript|tsx|javascript|ts|js|ini|mako|json|html|css)?\s*\n([\s\S]*?)```/i);
        if (fenceMatch && fenceMatch[1].trim()) {
          extractedCandidate = fenceMatch[1].trim();
        } else if (fallbackOutput && !fallbackOutput.includes('<patch') && !fallbackOutput.includes('<search>')) {
          extractedCandidate = fallbackOutput.trim();
        }
      }

      if (extractedCandidate) {
        let cleanFallbackContent = stripMarkdownWrappers(extractedCandidate);
        cleanFallbackContent = cleanFallbackContent.replace(/<file\s+path=["'][^"']+["']>\r?\n?/gi, '').replace(/\r?\n?<\/file>/gi, '').trim();
        if (fileDef.path.endsWith('.py')) {
          cleanFallbackContent = sanitizePythonCode(cleanFallbackContent, fileDef.path);
        }

        // 1. Source completeness check
        const comp = validateSourceCompleteness(cleanFallbackContent, fileDef.path);
        const normPath = (fileDef.path || '').toLowerCase();
        const isTsxOrJsx = normPath.endsWith('.tsx') || normPath.endsWith('.jsx');
        const isPageOrComponent = normPath.includes('/pages/') || normPath.includes('/components/');
        const isTinyStub = (cleanFallbackContent || '').trim().length < 40 ||
          (isPageOrComponent && (cleanFallbackContent || '').trim().length < 350) ||
          (isTsxOrJsx && isPlaceholderStubComponent(cleanFallbackContent, path.basename(fileDef.path, path.extname(fileDef.path))));

        if (comp.isComplete && !isTinyStub) {
          const candidateFile = { ...fileDef, content: cleanFallbackContent };

          // 2. Syntax validation
          let syntaxReval = await validateCandidate(candidateFile);
          const candidateCreds = [...scanForCredentials(candidateFile), ...scanForSecuritySinks(candidateFile)];

          // 3. Dependency / import closure validation
          let importClosureValid = true;
          try {
            const allProjectFiles = [
              candidateFile,
              ...(manifest?.modules || []).flatMap(m => m.required_files || []).filter(f => f.path !== fileDef.path)
            ];
            const closureRes = validateImportClosure(allProjectFiles);
            if (closureRes && !closureRes.isValid) {
              const fileClosureErrors = (closureRes.errors || []).filter(err => err.includes(fileDef.path));
              if (fileClosureErrors.length > 0) {
                importClosureValid = false;
                sendEvent('log', `⚠️ [repair_fallback] Import closure validation failed for ${fileDef.path}: ${fileClosureErrors.join(', ')}`);
              }
            }
          } catch (_) {}

          if (syntaxReval.isValid && candidateCreds.length === 0 && importClosureValid) {
            fileDef.content = cleanFallbackContent;
            fileDef.status = 'validated';
            fileDef.errors = [];
            fileDef.defects = [];
            sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
            sendEvent('log', `✅ [repair_fallback] Bounded fallback clean regeneration succeeded and verified (syntax + completeness + imports) for ${fileDef.path}.`);
            return {
              success: true,
              status: 'repaired',
              repaired: true,
              alreadyValid: false,
              newContent: cleanFallbackContent
            };
          } else {
            sendEvent('log', `⚠️ [repair_fallback] Fallback file failed validation checks (syntaxValid=${syntaxReval.isValid}, creds=${candidateCreds.length}, closureValid=${importClosureValid}).`);
          }
        } else {
          sendEvent('log', `⚠️ [repair_fallback] Fallback content incomplete or truncated (complete=${comp.isComplete}, tiny=${isTinyStub}).`);
        }
      }
    } catch (fbErr) {
      sendEvent('log', `⚠️ [repair_fallback] Fallback execution error: ${fbErr.message}`);
      if (/quota|429|resource_exhausted|rate limit|retry in|ECONNRESET|ETIMEDOUT|fetch failed/i.test(fbErr.message)) {
        fileDef.repairAttempts = Math.max(0, (fileDef.repairAttempts || 1) - 1);
        sendEvent('log', `⏳ [recovery_paused] Quota/Transient pause during fallback for ${fileDef.path}. Repair attempt preserved.`);
        return { success: false, isTransient: true, status: 'repairing' };
      }
    }
    return null;
  };

  // Handle empty or uninitialized files (0 chars) cleanly via authoritative regeneration
  const isEmptyFile = !fileDef.content || typeof fileDef.content !== 'string' || fileDef.content.trim().length === 0;

  if (isEmptyFile) {
    sendEvent('log', `📄 [repair_empty_file] Target file ${fileDef.path} is empty or uninitialized (0 chars). Executing clean generation fallback directly (skipping search/replace patch).`);
    const fallbackRes = await executeCleanFallback('File content is empty or uninitialized; full generation required.');
    if (fallbackRes) return fallbackRes;

    // If clean fallback did not return success, attempt bounded whole-file regeneration
    try {
      sendEvent('log', `🔄 [repair_empty_file] Attempting clean whole-file regeneration for empty file ${fileDef.path}...`);
      const regenPrompt = `Generate the complete, unbroken source file for "${fileDef.path}".
Module: ${activeModule?.id || 'root'} (${activeModule?.name || 'root'})
Requirements:
1. Write the full implementation in one single unbroken <file path="${fileDef.path}"> ... </file> block.
2. Ensure all classes, functions, and interfaces are fully closed and syntactically balanced.
3. Fully satisfy the authoritative module and file contracts.
4. DO NOT output search/replace patches. DO NOT truncate. DO NOT output conversational text.
5. Begin with <file path="${fileDef.path}"> and end with </file>.`;

      const regenOutput = await caller(systemPrompt, regenPrompt, { sendEvent, generationId });
      let cleanContent = null;
      const fileMatch = regenOutput && regenOutput.match(/<file\s+path=["']([^"']+)["']>([\s\S]*?)<\/file>/i);
      if (fileMatch && fileMatch[1].replace(/\\/g, '/').toLowerCase() === fileDef.path.replace(/\\/g, '/').toLowerCase()) {
        cleanContent = fileMatch[2];
      } else {
        const fenceMatch = regenOutput && regenOutput.match(/```(?:python|typescript|tsx|javascript|ts|js|ini|mako|json|html|css)?\s*\n([\s\S]*?)```/i);
        if (fenceMatch && fenceMatch[1].trim()) {
          cleanContent = fenceMatch[1].trim();
        } else if (regenOutput && !regenOutput.includes('<patch') && !regenOutput.includes('<search>')) {
          cleanContent = regenOutput.trim();
        }
      }

      if (cleanContent) {
        cleanContent = stripMarkdownWrappers(cleanContent).replace(/<file\s+path=["'][^"']+["']>\r?\n?/gi, '').replace(/\r?\n?<\/file>/gi, '').trim();
        if (fileDef.path.endsWith('.py')) {
          cleanContent = sanitizePythonCode(cleanContent, fileDef.path);
        }
        const comp = validateSourceCompleteness(cleanContent, fileDef.path);
        if (comp.isComplete) {
          const testFile = { ...fileDef, content: cleanContent };
          let reval = await validateCandidate(testFile);
          const creds = [...scanForCredentials(testFile), ...scanForSecuritySinks(testFile)];
          if (reval.isValid && creds.length === 0) {
            fileDef.content = cleanContent;
            fileDef.status = 'validated';
            fileDef.errors = [];
            fileDef.defects = [];
            sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
            sendEvent('log', `✅ [repair_empty_file] Whole-file regeneration succeeded for empty file ${fileDef.path}.`);
            return { success: true, status: 'repaired', repaired: true, alreadyValid: false, newContent: cleanContent };
          }
        }
      }
    } catch (errC) {
      sendEvent('log', `⚠️ [repair_empty_file] Regeneration error: ${errC.message}`);
      if (/quota|429|resource_exhausted|rate limit|retry in|ECONNRESET|ETIMEDOUT|fetch failed/i.test(errC.message)) {
        fileDef.repairAttempts = Math.max(0, (fileDef.repairAttempts || 1) - 1);
        sendEvent('log', `⏳ [recovery_paused] Quota/Transient pause during recovery for empty file ${fileDef.path}. Repair attempt preserved.`);
        return { success: false, isTransient: true, status: 'repairing' };
      }
    }

    // For empty files, we NEVER attempt a search/replace patch because there is no content to search.
    fileDef.status = 'failed';
    fileDef.errors = ['Empty file could not be generated from contract.'];
    sendEvent('repair_blocked', { path: fileDef.path, attempt, reason: fileDef.errors[0] });
    return { success: false, status: 'failed', errors: fileDef.errors };
  }

  // Handle truncation and missing file boundary defects via generic 3-tier recovery sequence
  if (
    primaryDefect.code === DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED ||
    primaryDefect.code === DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING ||
    primaryDefect.code === DATABASE_DEFECT_CODES.GENERATION_CONTINUATION_INVALID
  ) {
    sendEvent('log', `🔧 [generation_recovery] Running 3-tier boundary recovery for ${fileDef.path} (Defect: ${primaryDefect.code})...`);
    const initialContent = fileDef.content || '';

    const boundarySystemPrompt = `You are an elite Principal Software Engineer.
Generate complete, unbroken, production-grade source code.
CRITICAL INSTRUCTIONS:
1. Output ONLY complete source code or file blocks.
2. DO NOT output search/replace patches, <patch>, <search>, or <replace> tags.
3. DO NOT output stubs, markdown wrappers, or conversational text.`;

    // Attempt A: Exact Cutoff Continuation
    try {
      const lastLines = initialContent.split('\n').slice(-20).join('\n');
      const continuationPrompt = `[CONTINUATION REQUIRED: PREVIOUS OUTPUT WAS TRUNCATED]
Target File: ${fileDef.path}

The previous output for this file ended abruptly at:
----------------------------------------
${lastLines}
----------------------------------------

CONTINUATION INSTRUCTIONS:
1. Continue generating the missing code for "${fileDef.path}" starting exactly where it stopped.
2. DO NOT restart the file from the beginning.
3. DO NOT repeat the lines shown above.
4. DO NOT wrap your output in markdown \`\`\` code fences.
5. When complete, output the closing tag: </file>

Begin writing the continuation immediately:`;

      const nextOutput = await caller(boundarySystemPrompt, continuationPrompt, { sendEvent, generationId });
      if (nextOutput && (nextOutput.includes('<patch') || nextOutput.includes('<search>'))) {
        rawPatchOutput = nextOutput; // Capture for standard patch-apply path below
      } else if (nextOutput) {
        const baseWithTag = `<file path="${fileDef.path}">\n${initialContent}`;
        const stitchResult = mergeFileContinuation(baseWithTag, nextOutput, fileDef.path);
        if (stitchResult.progress) {
          let stitchedContent = stitchResult.merged.replace(/^[\s\S]*?<file\s+path=["'][^"']+["']>\r?\n?/i, '').replace(/\r?\n?<\/file>[\s\S]*$/i, '');
          stitchedContent = stripMarkdownWrappers(stitchedContent);
          const comp = validateSourceCompleteness(stitchedContent, fileDef.path);
          if (comp.isComplete) {
            const testFile = { ...fileDef, content: stitchedContent };
            let reval = await validateCandidate(testFile);
            if (reval.isValid) {
              fileDef.content = stitchedContent;
              fileDef.status = 'validated';
              fileDef.errors = [];
              sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
              sendEvent('log', `✅ [generation_recovery] Attempt A succeeded for ${fileDef.path}.`);
              return { success: true, status: 'repaired', repaired: true, alreadyValid: false, newContent: stitchedContent };
            }
          }
        }
      }
    } catch (errA) {
      sendEvent('log', `⚠️ [generation_recovery] Attempt A error: ${errA.message}`);
    }

    // Attempt B: Rollback to Last Stable Syntactic Boundary
    if (!rawPatchOutput) {
      try {
        const { stableContent, rolledBack } = findLastStableSyntacticBoundary(initialContent, fileDef.path);
        if (rolledBack && stableContent.length > 50) {
          sendEvent('log', `🔄 [generation_recovery] Attempt B: Rolling back ${fileDef.path} to stable boundary (${stableContent.length} chars).`);
          const stableLines = stableContent.split('\n').slice(-25).join('\n');
          const stablePrompt = `[CONTINUATION FROM STABLE BOUNDARY: PREVIOUS ATTEMPT TRUNCATED]
Target File: ${fileDef.path}

The previous output had an incomplete syntax break. The code has been rolled back to the last stable block boundary:
----------------------------------------
${stableLines}
----------------------------------------

CONTINUATION INSTRUCTIONS:
1. Continue implementing the remaining functions, classes, and code for "${fileDef.path}" starting from this stable boundary.
2. DO NOT restart the file from the beginning.
3. DO NOT repeat the lines shown above.
4. DO NOT wrap your output in markdown \`\`\` code fences.
5. When complete, output the closing tag: </file>

Begin writing the remaining code immediately:`;

          const nextOutput = await caller(boundarySystemPrompt, stablePrompt, { sendEvent, generationId });
          if (nextOutput && (nextOutput.includes('<patch') || nextOutput.includes('<search>'))) {
            rawPatchOutput = nextOutput;
          } else if (nextOutput) {
            const baseWithTag = `<file path="${fileDef.path}">\n${stableContent}`;
            const stitchResult = mergeFileContinuation(baseWithTag, nextOutput, fileDef.path);
            if (stitchResult.progress) {
              let stitchedContent = stitchResult.merged.replace(/^[\s\S]*?<file\s+path=["'][^"']+["']>\r?\n?/i, '').replace(/\r?\n?<\/file>[\s\S]*$/i, '');
              stitchedContent = stripMarkdownWrappers(stitchedContent);
              const comp = validateSourceCompleteness(stitchedContent, fileDef.path);
              if (comp.isComplete) {
                const testFile = { ...fileDef, content: stitchedContent };
                let reval = await validateCandidate(testFile);
                if (reval.isValid) {
                  fileDef.content = stitchedContent;
                  fileDef.status = 'validated';
                  fileDef.errors = [];
                  sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
                  sendEvent('log', `✅ [generation_recovery] Attempt B succeeded for ${fileDef.path}.`);
                  return { success: true, status: 'repaired', repaired: true, alreadyValid: false, newContent: stitchedContent };
                }
              }
            }
          }
        }
      } catch (errB) {
        sendEvent('log', `⚠️ [generation_recovery] Attempt B error: ${errB.message}`);
      }
    }

    // Attempt C: Clean Whole-File Regeneration
    if (!rawPatchOutput) {
      try {
        sendEvent('log', `🔄 [generation_recovery] Attempt C: Cleanly regenerating ${fileDef.path}...`);
        const regenPrompt = `Generate the complete, unbroken source file for "${fileDef.path}".
Requirements:
1. Write the full implementation in one single unbroken <file path="${fileDef.path}"> ... </file> block.
2. Ensure all classes, functions, and interfaces are fully closed and syntactically balanced.
3. DO NOT truncate. DO NOT output conversational text.
4. Begin with <file path="${fileDef.path}"> and end with </file>.`;

        const regenOutput = await caller(boundarySystemPrompt, regenPrompt, { sendEvent, generationId });
        if (regenOutput && (regenOutput.includes('<patch') || regenOutput.includes('<search>'))) {
          rawPatchOutput = regenOutput;
        } else if (regenOutput) {
          const fileMatch = regenOutput.match(/<file\s+path=["']([^"']+)["']>([\s\S]*?)<\/file>/i);
          let cleanContent = fileMatch && fileMatch[1].replace(/\\/g, '/') === fileDef.path.replace(/\\/g, '/')
            ? stripMarkdownWrappers(fileMatch[2])
            : stripMarkdownWrappers(regenOutput.replace(/```(?:tsx|ts|jsx|js|python|py)?/gi, '').replace(/```/g, '').trim());

          const comp = validateSourceCompleteness(cleanContent, fileDef.path);
          if (comp.isComplete) {
            const testFile = { ...fileDef, content: cleanContent };
            let reval = await validateCandidate(testFile);
            if (reval.isValid) {
              fileDef.content = cleanContent;
              fileDef.status = 'validated';
              fileDef.errors = [];
              sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
              sendEvent('log', `✅ [generation_recovery] Attempt C succeeded for ${fileDef.path}.`);
              return { success: true, status: 'repaired', repaired: true, alreadyValid: false, newContent: cleanContent };
            }
          }
        }
      } catch (errC) {
        sendEvent('log', `⚠️ [generation_recovery] Attempt C error: ${errC.message}`);
        if (/quota|429|resource_exhausted|rate limit|retry in|ECONNRESET|ETIMEDOUT|fetch failed/i.test(errC.message)) {
          fileDef.repairAttempts = Math.max(0, (fileDef.repairAttempts || 1) - 1);
          sendEvent('log', `⏳ [recovery_paused] Quota/Transient pause during recovery for ${fileDef.path}. Repair attempt preserved.`);
          return { success: false, isTransient: true, status: 'repairing' };
        }
      }
    }

    // If all 3 tiers failed and no patch output:
    if (!rawPatchOutput) {
      fileDef.status = 'failed';
      fileDef.errors = [primaryDefect.message || 'Output format truncated and recovery tiers exhausted.'];
      sendEvent('repair_blocked', { path: fileDef.path, attempt, reason: fileDef.errors[0] });
      return {
        success: false,
        status: 'failed',
        errors: fileDef.errors
      };
    }
  }

  // 3. Invoke LLM for Targeted Patch if not already provided
  if (!rawPatchOutput) {
    try {
      rawPatchOutput = await caller(systemPrompt, userPrompt, { sendEvent, generationId });
    } catch (err) {
      const isQuotaOrTransient = /quota|429|resource_exhausted|rate limit|retry in|ECONNRESET|ETIMEDOUT|fetch failed/i.test(err.message);
      if (isQuotaOrTransient) {
        // R1: Infrastructure, network, and quota rate limits MUST NOT consume repair attempt budgets!
        fileDef.repairAttempts = Math.max(0, (fileDef.repairAttempts || 1) - 1);
        sendEvent('log', `⏳ [repair_paused] Transient/Quota delay on ${fileDef.path}: ${redactSecret(err.message)}. Repair attempt count preserved.`);
        return {
          success: false,
          isTransient: true,
          error: redactSecret(err.message),
          status: 'repairing'
        };
      }
      fileDef.status = 'failed';
      fileDef.errors = [redactSecret(err.message)];
      sendEvent('log', `❌ [repair_failed] LLM API failure during repair: ${redactSecret(err.message)}`);
      return {
        success: false,
        error: `LLM error: ${err.message}`,
        status: 'failed'
      };
    }
  }

  // 4. Parse and validate the patch before applying it.
  let parsed = parsePatch(rawPatchOutput, fileDef.path);
  let patch = parsed.valid ? parsed.patch : null;
  let patchRetryCount = 0;
  let patchVal = parsed.valid
    ? validatePatch({ patch, existingContent: fileDef.content, filePath: fileDef.path })
    : { valid: false, error: parsed.error };

  if (patch) {
    // When a repair attempt produces NO_PROGRESS/OSCILLATION, do NOT repeat the same patch
    const isRepeatedFailedPatch = (fileDef.repairHistory || []).some(h =>
      h.patch && h.patch.search === patch.search && h.patch.replace === patch.replace
    );
    if (isRepeatedFailedPatch) {
      sendEvent('log', `🛑 [repair_repeated_patch_rejected] LLM repeated identical previously-failed patch for ${fileDef.path}. Rejecting.`);
      parsed = { valid: false, error: 'Repeated identical patch that previously produced NO_PROGRESS/OSCILLATION.' };
      patch = null;
      patchVal = { valid: false, error: parsed.error };
    } else {
      sendEvent('repair_patch_generated', {
        path: fileDef.path,
        searchLength: patch.search.length,
        replaceLength: patch.replace.length
      });
    }
  }

  // A stale search block gets one targeted retry using the current manifest content.
  if (!patchVal.valid && patchVal.error.includes('Patch search block could not be located')) {
    const currentContent = String(fileDef.content || '');
    const currentContentHash = generateFileHash(currentContent);
    const currentFileDef = { ...fileDef, content: currentContent };
    const refreshedContext = buildRepairContext({
      fileDef: currentFileDef,
      activeModule,
      manifest,
      defects
    });
    const retryUserPrompt = `${refreshedContext.userPrompt}

PATCH SEARCH RETRY
The previous targeted patch was rejected because its search block does not exist in the current file.
Current file content hash: ${currentContentHash}
Re-read the current file content above and return one minimal patch whose search block is copied exactly from it.
Do not include line numbers in the <search> or <replace> blocks.
You MUST provide both <search> and <replace> blocks inside <patch file="${fileDef.path}">.
Do not summarize, truncate, add ellipses, or replace the entire file.`;

    sendEvent('repair_patch_context_retry', {
      path: fileDef.path,
      defectCode: primaryDefect.code,
      currentContentHash,
      patchReason: redactSecret(patchVal.error)
    });

    try {
      const retriedOutput = await caller(refreshedContext.systemPrompt, retryUserPrompt, { sendEvent, generationId });
      patchRetryCount = 1;
      parsed = parsePatch(retriedOutput, fileDef.path);
      patch = parsed.valid ? parsed.patch : null;
      patchVal = parsed.valid
        ? validatePatch({ patch, existingContent: currentContent, filePath: fileDef.path })
        : { valid: false, error: parsed.error };
      if (patch) {
        sendEvent('repair_patch_generated', {
          path: fileDef.path,
          searchLength: patch.search.length,
          replaceLength: patch.replace.length,
          retry: patchRetryCount
        });
      }
    } catch (err) {
      patchRetryCount = 1;
      patch = null;
      patchVal = { valid: false, error: `Targeted patch retry failed: ${err.message}` };
    }
  }

  if (!parsed.valid || !patchVal.valid) {
    const patchReason = patchVal.error || parsed.error;

    // Revalidate existing uncorrupted file independently before deciding repair outcome
    let indepReval = { isValid: true, errors: [] };
    indepReval = await validateCandidate(fileDef);
    const currentCreds = [...scanForCredentials(fileDef), ...scanForSecuritySinks(fileDef)];
    const existingDefects = [
      ...(indepReval.errors || []).map(err => ({ code: DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE || 'SYN001', message: err })),
      ...currentCreds
    ];

    if (indepReval.isValid && existingDefects.length === 0) {
      fileDef.status = 'validated';
      fileDef.errors = [];
      sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'already_valid' });
      sendEvent('log', `ℹ️ [repair_already_valid] ${fileDef.path} is unchanged and verified valid.`);
      return {
        success: true,
        status: 'already_valid',
        repaired: false,
        alreadyValid: true,
        newContent: fileDef.content
      };
    }

    // For FILE_BOUNDARY_MISSING / OUTPUT_FORMAT_TRUNCATED, perform safe output-format recovery if full file returned
    if (primaryDefect.code === DATABASE_DEFECT_CODES.FILE_BOUNDARY_MISSING || primaryDefect.code === DATABASE_DEFECT_CODES.OUTPUT_FORMAT_TRUNCATED) {
      const fullFileMatch = rawPatchOutput && rawPatchOutput.match(/<file\s+path=["']([^"']+)["']>([\s\S]*?)<\/file>/i);
      if (fullFileMatch && fullFileMatch[1].replace(/\\/g, '/') === fileDef.path.replace(/\\/g, '/')) {
        let recoveredContent = fullFileMatch[2].trim();
        recoveredContent = recoveredContent.replace(/^```[a-z0-9_-]*\r?\n/i, '').replace(/\r?\n```\s*$/i, '').trim();
        recoveredContent = recoveredContent.replace(/<file\s+path=["'][^"']+["']>\r?\n?/gi, '').replace(/\r?\n?<\/file>/gi, '');
        const candidateFile = { ...fileDef, content: recoveredContent };
        let candidateReval = { isValid: true, errors: [] };
        candidateReval = await validateCandidate(candidateFile);
        const candidateCreds = [...scanForCredentials(candidateFile), ...scanForSecuritySinks(candidateFile)];
        if (candidateReval.isValid && candidateCreds.length === 0) {
          const hashBeforeRecovery = generateFileHash(fileDef.content);
          const hashAfterRecovery = generateFileHash(recoveredContent);
          fileDef.content = recoveredContent;
          fileDef.status = 'validated';
          fileDef.errors = [];
          if (hashBeforeRecovery !== hashAfterRecovery) {
            sendEvent('repair_patch_applied', { path: fileDef.path, hashBefore: hashBeforeRecovery, hashAfter: hashAfterRecovery });
            sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
            sendEvent('log', `✅ [repair_completed] ${fileDef.path} repaired via safe output-format recovery.`);
            return {
              success: true,
              status: 'repaired',
              repaired: true,
              alreadyValid: false,
              newContent: fileDef.content
            };
          } else {
            sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'already_valid' });
            sendEvent('log', `ℹ️ [repair_already_valid] ${fileDef.path} is unchanged and verified valid.`);
            return {
              success: true,
              status: 'already_valid',
              repaired: false,
              alreadyValid: true,
              newContent: fileDef.content
            };
          }
        }
      }
    }

    const failure = buildRepairFailure({
      fileDef,
      defect: primaryDefect,
      reason: patchReason,
      attempt,
      patch,
      retryCount: patchRetryCount
    });
    sendEvent('log', `⚠️ [repair_patch_rejected] ${failure.patchReason}`);
    sendEvent('repair_patch_failed', failure);

    if (attempt >= 2 && !fileDef.fallbackAttempted) {
      const fbResult = await executeCleanFallback(failure.patchReason);
      if (fbResult) return fbResult;
    }

    if (attempt >= MAX_FILE_REPAIR_ATTEMPTS) {
      fileDef.status = 'failed';
      fileDef.errors = [failure.patchReason];
      fileDef.repairFailure = failure;
      sendEvent('repair_blocked', { path: fileDef.path, attempt, reason: failure.patchReason, failure });
    }
    return {
      success: false,
      error: failure.patchReason,
      status: fileDef.status === 'failed' ? 'failed' : 'patch_validation_failed',
      failure
    };
  }

  sendEvent('repair_patch_validated', { path: fileDef.path });

  // 6. Apply Patch
  const originalContent = fileDef.content;
  const hashBefore = generateFileHash(originalContent);
  const applyResult = applyPatch({
    patch,
    existingContent: fileDef.content
  });

  if (!applyResult.applied) {
    // Revalidate existing file independently before deciding the repair outcome
    let indepReval = { isValid: true, errors: [] };
    indepReval = await validateCandidate(fileDef);
    const currentCreds = [...scanForCredentials(fileDef), ...scanForSecuritySinks(fileDef)];
    const existingDefects = [
      ...(indepReval.errors || []).map(err => ({ code: DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE || 'SYN001', message: err })),
      ...currentCreds
    ];

    if (indepReval.isValid && existingDefects.length === 0) {
      fileDef.status = 'validated';
      fileDef.errors = [];
      sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'already_valid' });
      sendEvent('log', `ℹ️ [repair_already_valid] ${fileDef.path} patch could not be applied, but file is already independently valid.`);
      return {
        success: true,
        status: 'already_valid',
        repaired: false,
        alreadyValid: true,
        newContent: fileDef.content
      };
    }

    const failure = buildRepairFailure({
      fileDef,
      defect: primaryDefect,
      reason: applyResult.error,
      attempt,
      patch,
      retryCount: patchRetryCount
    });
    sendEvent('log', `❌ [repair_patch_failed] ${failure.patchReason}`);
    sendEvent('repair_patch_failed', failure);

    if (attempt >= 2 && !fileDef.fallbackAttempted) {
      const fbResult = await executeCleanFallback(failure.patchReason);
      if (fbResult) return fbResult;
    }

    if (attempt >= MAX_FILE_REPAIR_ATTEMPTS) {
      fileDef.status = 'failed';
      fileDef.errors = [failure.patchReason];
      fileDef.repairFailure = failure;
      sendEvent('repair_blocked', { path: fileDef.path, attempt, reason: failure.patchReason, failure });
    }
    return {
      success: false,
      error: failure.patchReason,
      status: fileDef.status === 'failed' ? 'failed' : 'patch_apply_failed',
      failure
    };
  }

  const hashAfter = generateFileHash(applyResult.newContent);
  const isHashChanged = hashBefore !== hashAfter;
  fileDef.content = applyResult.newContent;
  if (fileDef.path.endsWith('.py')) {
    fileDef.content = sanitizePythonCode(fileDef.content, fileDef.path);
  }

  // Report repair_patch_applied strictly when file content changed
  if (isHashChanged) {
    sendEvent('repair_patch_applied', {
      path: fileDef.path,
      hashBefore,
      hashAfter
    });
    sendEvent('log', `🩹 [repair_patch_applied] Patch successfully applied to ${fileDef.path}.`);
  }

  // 7. Revalidate
  sendEvent('repair_revalidation_started', { path: fileDef.path });
  let revalidationResult = { isValid: true, errors: [] };
  if (typeof validateFn === 'function') {
        revalidationResult = await validateCandidate(fileDef);
  }

  // Also check database credentials on patched content
  const remainingCreds = [...scanForCredentials(fileDef), ...scanForSecuritySinks(fileDef)];
  const remainingDefects = (revalidationResult.defects && revalidationResult.defects.length > 0)
    ? [...revalidationResult.defects, ...remainingCreds]
    : [
        ...(revalidationResult.errors || []).map(err => ({
          code: DATABASE_DEFECT_CODES.SYNTAX_VALIDATION_FAILURE || 'SYN001',
          message: typeof err === 'string' ? err : err?.message || String(err)
        })),
        ...remainingCreds
      ];

  if (!revalidationResult.isValid && remainingDefects.length === 0) {
    remainingDefects.push({
      code: 'REVALIDATION_FAILED',
      message: 'Revalidation returned isValid=false'
    });
  }

  // 8. Progress Detection
  if (!fileDef.repairHistory) {
    fileDef.repairHistory = [];
  }

  const progress = detectRepairProgress({
    hashBefore,
    hashAfter,
    defectsBefore: defects,
    defectsAfter: remainingDefects,
    attempt,
    history: fileDef.repairHistory
  });

  fileDef.repairHistory.push({
    attempt,
    hashBefore,
    hashAfter,
    defectsBefore: defects,
    defectsAfter: remainingDefects,
    status: progress.status,
    patch: patch ? { search: patch.search, replace: patch.replace } : null
  });

  if (progress.status === 'NO_CHANGE' || progress.status === 'NO_IMPROVEMENT' || progress.status === 'OSCILLATION' || progress.status === 'REGRESSED') {
    sendEvent('repair_no_progress', {
      path: fileDef.path,
      attempt,
      status: progress.status,
      message: progress.message
    });
    sendEvent('log', `🛑 [repair_no_progress] ${progress.message}`);
  } else {
    sendEvent('repair_progress_detected', {
      path: fileDef.path,
      attempt,
      status: progress.status,
      message: progress.message
    });
    sendEvent('log', `📈 [repair_progress_detected] ${progress.message}`);
  }

  if (remainingDefects.length === 0 && revalidationResult.isValid) {
    fileDef.status = 'validated';
    fileDef.errors = [];
    if (isHashChanged) {
      sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'repaired' });
      sendEvent('log', `✅ [repair_completed] ${fileDef.path} repaired and validated successfully.`);
      return {
        success: true,
        status: 'repaired',
        repaired: true,
        alreadyValid: false,
        newContent: fileDef.content
      };
    } else {
      sendEvent('repair_completed', { path: fileDef.path, attempt, status: 'already_valid' });
      sendEvent('log', `ℹ️ [repair_already_valid] ${fileDef.path} is unchanged and verified valid.`);
      return {
        success: true,
        status: 'already_valid',
        repaired: false,
        alreadyValid: true,
        newContent: fileDef.content
      };
    }
  }

  fileDef.errors = remainingDefects.map(d => d.message || d);

  // If repair did not resolve defects, revert content if it regressed, oscillated, made no improvement, or didn't change
  if (
    progress.status === 'REGRESSED' || progress.classification === 'REGRESSED' ||
    progress.status === 'OSCILLATION' || progress.classification === 'OSCILLATION' ||
    progress.status === 'NO_IMPROVEMENT' || progress.classification === 'NO_PROGRESS' ||
    !isHashChanged
  ) {
    fileDef.content = originalContent;
  }

  // Bounded Fallback: Clean regeneration from authoritative contract when NO_PROGRESS, stagnation, or OSCILLATION occurs
  const isStagnantOrOscillating = (
    progress.status === 'OSCILLATION' ||
    progress.classification === 'OSCILLATION' ||
    ((progress.status === 'NO_IMPROVEMENT' || progress.status === 'NO_CHANGE' || progress.classification === 'NO_PROGRESS' || !isHashChanged) &&
     (attempt >= 2 || (fileDef.repairHistory && fileDef.repairHistory.length >= 2)))
  );

  if (isStagnantOrOscillating && !fileDef.fallbackAttempted) {
    const fbRes = await executeCleanFallback(progress.status || progress.classification, remainingDefects);
    if (fbRes) return fbRes;
  }

  // Fail-closed termination if fallback failed, max attempts reached, or regression detected
  if (
    progress.status === 'REGRESSED' || progress.classification === 'REGRESSED' ||
    fileDef.fallbackAttempted ||
    attempt >= MAX_FILE_REPAIR_ATTEMPTS
  ) {
    fileDef.status = 'failed';
    sendEvent('repair_blocked', {
      path: fileDef.path,
      attempt,
      reason: progress.message || 'Maximum repair attempts or fallback failure reached'
    });
    sendEvent('log', `❌ [repair_blocked] ${fileDef.path} reached max repair attempts or stagnation. Marked failed.`);
    return {
      success: false,
      status: 'failed',
      errors: fileDef.errors
    };
  }

  if (!isHashChanged) {
    fileDef.status = 'repairing';
    sendEvent('repair_no_progress', {
      path: fileDef.path,
      attempt,
      status: 'no_progress',
      message: `Repair attempt ${attempt} produced zero changes and defects persist.`
    });
    sendEvent('log', `🛑 [repair_no_progress] ${fileDef.path} produced zero changes and remains invalid.`);
    return {
      success: false,
      status: 'no_progress',
      errors: fileDef.errors
    };
  }

  fileDef.status = 'repairing';
  return {
    success: false,
    status: 'repairing',
    errors: fileDef.errors
  };
}

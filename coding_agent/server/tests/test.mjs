import * as dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });
import { getLLMClientConfig } from '../llmRouter.js';
console.log(JSON.stringify(getLLMClientConfig(), null, 2));

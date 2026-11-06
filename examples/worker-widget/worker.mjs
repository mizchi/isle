import contracts from '../../dist/worker-widget/server/contracts.json' with { type: 'json' };
import { createWorkerHandler } from '../../lib/worker.mjs';
import { createDemoHost } from './host.mjs';

// Explicitly public/stateless. Restrict publishers with an exact origin list when needed.
export default createWorkerHandler(contracts, createDemoHost(contracts.taskIds), { allowedOrigins: '*' });

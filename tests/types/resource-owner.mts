import { createResourceOwner, type OwnedResource } from '../../runtime/resource-owner.mjs';
import type { ResumeSnapshot } from '../../lib/client-contracts.d.ts';
const lifetime = new AbortController();
const owner = createResourceOwner({ signal: lifetime.signal, onError(error: unknown) { void error; } });
const resource: OwnedResource<{ id: string }> = owner.acquire(async signal => {
  signal.throwIfAborted(); return { id: 'connection' };
}, value => { value.id.toUpperCase(); });
const value: { id: string } = resource.read();
void value;
const child = owner.fork(); child.own(1, value => { value.toFixed(); });
owner.dispose(); await owner.settled();
// @ts-expect-error A destructor must accept the acquired value's type.
owner.own(1, (value: string) => { void value; });
// @ts-expect-error A live capability is not a serializable snapshot value.
const snapshot: ResumeSnapshot = [2, 'schema', 'owner', [resource]];
void snapshot;

import type { ClientResourceSetup, ClientRegistry } from '../../lib/client-contracts.d.ts';
const setup: ClientResourceSetup = ({ root, owner, id }) => {
  owner.own(root, value => { value.removeAttribute('data-resource-ready'); });
  root.dataset.resourceReady = id;
};
void setup;
// @ts-expect-error Async initialization must be registered through owner.acquire.
const invalidSetup: ClientResourceSetup = async ({ owner }) => { void owner; };
void invalidSetup;
const registry: ClientRegistry = [{}, ['click'], {}, [], 'https://example.test/', null, {}];
void registry;

import { compile, requireIR } from './compiler.mjs';
import { prepareProgram, isResumable, escapeHtml, encodeSnapshot } from './codegen.mjs';
import { analyzeCosts, checkCostBudgets } from './cost.mjs';
import { createActionHandler } from './server.mjs';
import { fileURLToPath } from 'node:url';
import { minify, transformWithOxc } from 'vite';
import { createCodeManifest, loadingPolicies, loadingTags, injectLoadingTags } from './code-manifest.mjs';
import { DEFAULT_AUTO_PRELOAD_GZIP_BYTES, validatePreloadBudget } from './loading-plan.mjs';
import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve, dirname } from 'node:path';
import { sourceLocation } from './chunks.mjs';
import { speculationRules, speculationTags } from './speculation.mjs';
import { planHandlerChunks } from './chunk-plan.mjs';
import { widgetBuildOptions, buildWidgetDescriptor } from './widget-build.mjs';
import { runtimeIdentity } from '../runtime/runtime-identity.mjs';
import {collectStyles,styleTags as componentStyleTags} from './styles.mjs';
import { checkedLayoutOptions, loadCheckedStyles, validateCheckedHTML, injectCheckedStyles, certifyLayout, resolveCheckedLayout } from './layout-build.mjs';
import {hasLayoutDeclarations,declaredLayoutOptions} from './layout-declarations.mjs';
import {diagnosticLocation,formatWarning} from './compiler-warnings.mjs';

const registryId = '\0isle:registry';
const loaderId = '\0isle:loader';
const resumeId = '\0isle:resume';
const autoEntry = '/@isle/loader.js';
const handlerPrefix = 'virtual:isle-handler/';
const groupPrefix = 'virtual:isle-handler-group/';
const resourcePrefix = 'virtual:isle-resource/';
const resourceRoute = '/@isle/resource/';
const handlerRoute = '/@isle/handler/';
const resumeRoute = '/@isle/resume.js';
const runtimeId = fileURLToPath(new URL('../runtime/client.mjs', import.meta.url));
const loaderRuntimeId = fileURLToPath(new URL('../runtime/loader.mjs', import.meta.url));
const regionRuntimeId = fileURLToPath(new URL('../runtime/regions.mjs', import.meta.url));
const valueRuntimeId = fileURLToPath(new URL('../runtime/value.mjs', import.meta.url));
const formRuntimeId = fileURLToPath(new URL('../runtime/form.mjs', import.meta.url));
const widgetRuntimeId = fileURLToPath(new URL('../runtime/widget.mjs', import.meta.url));
const widgetMountId = '\0isle:widget-mount';
const widgetLoaderId = '\0isle:widget-loader';
const widgetVendorId = '\0isle:widget-runtime';
const widgetEngineId = '\0isle:widget-engine';
const widgetEngineBridgeId = '\0isle:widget-engine-bridge';
const widgetFormBridgeId = '\0isle:widget-form-bridge';
const sharedRuntimeId = fileURLToPath(new URL('../runtime/shared-runtime.mjs', import.meta.url));
const identityId = fileURLToPath(new URL('../runtime/runtime-identity.mjs', import.meta.url));
const widgetABI = 'isle/widget/3';
export function isle({ entry, mounts, host, diagnostics, profile = false, mode = 'resume', clientEntry, resources = {}, loading = 'auto', autoPreloadGzipBytes = DEFAULT_AUTO_PRELOAD_GZIP_BYTES, speculation, handlerChunkBytes = 1024, cost = {}, widget: widgetOptions, wrapMounts = true, layout }) {
  const configuredLayout=layout;
  if (typeof wrapMounts !== 'boolean') throw new Error('wrapMounts must be a boolean');
  if (!['resume', 'ssr'].includes(mode) || mounts.some(mount => mount.mode && !['resume', 'ssr'].includes(mount.mode))) throw new Error('Unknown Isle render mode');
  if (!loadingPolicies.includes(loading) || mounts.some(mount => mount.loading && !loadingPolicies.includes(mount.loading))) throw new Error('Unknown Isle loading mode');
  validatePreloadBudget(autoPreloadGzipBytes);
  planHandlerChunks([], handlerChunkBytes);
  if (!resources || typeof resources !== 'object' || Array.isArray(resources) || ![Object.prototype, null].includes(Object.getPrototypeOf(resources)) || Object.entries(resources).some(([name, path]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || ['__proto__','prototype','constructor'].includes(name) || typeof path !== 'string' || !path)) throw new Error('Invalid resource entry configuration');
  checkedLayoutOptions(layout, {mounts,wrapMounts,clientEntry,resources,widget:widgetOptions});
  if (cost !== false) {
    if (!cost || typeof cost !== 'object' || Array.isArray(cost) || Object.keys(cost).some(key => key !== 'budgets')) throw new Error('Invalid Isle cost options');
    checkCostBudgets({ version: 1, entries: [] }, cost.budgets ?? []);
  }
  const navigationRules = speculationRules(speculation);
  const widget = widgetOptions === undefined ? null : widgetBuildOptions(widgetOptions);
  const sharedWidget = widget?.runtime === 'shared';
  const runtimeVersion = widget?.runtimeVersion ?? runtimeIdentity.version;
  let current, production, nonce, root, widgetMount, layoutStyles, checkedLayout, codeCSS = false, splitCSS = true, base = '/';
  const lazyFiles = new Map();
  const sharedFiles = new Map();
  const engineABI = () => `isle/client/${sharedWidget ? 8 : current?.components.some(c=>c.channels?.length) ? 8 : current?.resources.length ? 5 : current?.components.some(component => component.regions) ? 4 : 3}:debug=${Number(diagnostics ?? !production)}:profile=${Number(profile)}`;
  const componentPolicy = (name, reachable) => {
    const options = mounts.filter(mount => reachable.get(mount.component)?.has(name) && mount.mode !== 'ssr').map(mount => mount.loading ?? loading);
    return loadingPolicies[Math.max(...options.map(option => loadingPolicies.indexOf(option)))];
  };
  const sharedImport = (context, id, name, importer) => {
    const reference = context.emitFile({ type: 'chunk', id, name, preserveSignature: 'strict' });
    sharedFiles.set(reference, importer);
    return `/* @vite-ignore */ import.meta.ROLLUP_FILE_URL_${reference}`;
  };
  const load = async () => {
    const file = await realpath(entry), source = await readFile(file, 'utf8');
    if (current?.file === file && current.source === source) return current;
    const compiled=compile(source,{externalObservers:clientEntry?true:Object.keys(resources)}),ir=requireIR(compiled);
    for(const component of ir.components) {
      if(Object.hasOwn(resources,component.name)) component.optimizationBarrier='resource-setup';
      else if(clientEntry) component.optimizationBarrier='client-entry';
    }
    layout=configuredLayout;
    if(mounts.some(mount=>hasLayoutDeclarations(ir,mount.component))) {
      if(!layout) layout={viewport:declaredLayoutOptions(ir,{component:mounts[0].component}).viewport};
      checkedLayoutOptions(layout,{mounts,wrapMounts,clientEntry,resources,widget:widgetOptions});
    }
    const program = prepareProgram(ir), reachable = new Map(ir.components.map(component => [component.name, new Set(program.reachable(component.name))]));
    const names = new Set(mode === 'ssr' ? [] : mounts.filter(mount => mount.mode !== 'ssr').flatMap(mount => [...(reachable.get(mount.component) ?? [])]));
    const components = ir.components.filter(component => names.has(component.name) && isResumable(component)).map(component => program.get(component.name).generate()).filter(component=>component.handlers.length);
    const resourceEntries = [];
    for (const [name, path] of Object.entries(resources)) {
      const definition = ir.components.find(component => component.name === name);
      if (!definition || definition.side !== 'client' || !isResumable(definition)) throw new Error(`Resource setup requires an interactive client component: ${name}`);
      const component = components.find(component => component.name === name);
      if (component) resourceEntries.push({ id: `${name}.$resources`, name, schemaId: component.schemaId, path: await realpath(resolve(dirname(file), path)), source: definition.root.source });
    }
    for(const component of components) if(component.channels?.length&&!Object.hasOwn(resources,component.name)) throw new Error(`Resource channels require a setup entry: ${component.name}`);
    const hasIsland = node => node.kind === 'island' || node.children?.some(hasIsland);
    const nested = ir.components.some(component => names.has(component.name) && isResumable(component) && (component.children || hasIsland(component.root)));
    const requests = new Map(components.flatMap(component => component.handlers.map(handler => [handler.id, componentPolicy(component.name, reachable)])));
    const chunks = planHandlerChunks(components, handlerChunkBytes, requests);
    const emissions = new Map(chunks.flatMap(chunk => chunk.handlers.map((handler, index) => [handler.id, {
      id: chunk.handlers.length === 1 ? handlerPrefix + handler.id : groupPrefix + chunk.name,
      name: chunk.name, symbol: chunk.handlers.length === 1 ? handler.symbol : `h${index}`,
    }])));
    current = { ir, components, program, reachable, nested, source, file, chunks, emissions, resources: resourceEntries, warnings:compiled.diagnostics };
    return current;
  };
  const renderMounts = () => current.program.renderAll(mounts, { mode }).map((rendered, index) => {
    const mount = mounts[index];
    const output = rendered.html + rendered.snapshotHtml;
    return wrapMounts ? `<section class="card"><h2>${escapeHtml(mount.label)}</h2>${output}</section>` : output;
  }).join('\n');
  const inlineStyles=()=>[...new Map(mounts.flatMap(mount=>collectStyles(current.ir,mount.component)).map(style=>[style.id,style])).values()];
  const handlerMetadata = handler => ({ event: handler.event, async: handler.async,
    captureNames: handler.captureNames, writes: handler.writes, actions: handler.actions, computations: handler.computations,
    source: sourceLocation(current.source, handler.source, relative(root, current.file).replaceAll('\\', '/')) });
  const costReport = manifest => {
    if (cost === false) return null;
    const report = analyzeCosts(current.ir, { mounts, mode, manifest, budgets: cost.budgets ?? [] });
    for (const entry of report.entries) entry.location = sourceLocation(current.source, entry.source, relative(root, current.file).replaceAll('\\', '/'));
    return report;
  };
  const policies = () => new Map(current.components.flatMap(component => {
    const policy = componentPolicy(component.name, current.reachable);
    return [...component.handlers.map(handler => [handler.id, policy]), ...current.resources.filter(resource => resource.name === component.name).map(resource => [resource.id, policy])];
  }));
  const importLazy = (context, id, name, importer, plan) => {
    if (!production) return JSON.stringify(id);
    const reference = context.emitFile({ type: 'chunk', id, name, preserveSignature: 'strict' });
    if (!lazyFiles.has(reference)) lazyFiles.set(reference, { importer, plans: new Map() });
    lazyFiles.get(reference).plans.set(plan.id, plan);
    return `/* @vite-ignore */ import.meta.ROLLUP_FILE_URL_${reference}`;
  };
  const developmentTags = () => {
    const files = [{ id: 'isle:resume', file: resumeRoute.slice(1), symbol: 'resume', captures: [], kind: 'runtime' },
      ...current.components.flatMap(component => component.handlers.map(handler => ({ id: handler.id,
        file: `${handlerRoute.slice(1)}${handler.id}.js`, symbol: handler.symbol, captures: handler.captures, kind: 'handler', ...(current.resources.some(resource => resource.name === component.name) ? { requires: ['isle:resume', `${component.name}.$resources`] } : {}) }))),
      ...current.resources.map(resource => ({ id: resource.id, file: `${resourceRoute.slice(1)}${resource.name}.js`, symbol: 'setup', captures: [], kind: 'resource', schemaId: resource.schemaId }))];
    const bundle = Object.fromEntries(files.map(({ file }) => [file, { type: 'chunk', fileName: file, imports: [], dynamicImports: [] }]));
    return loadingTags(createCodeManifest(bundle, files, base === './' || base === '' ? '/' : base, policies(), { gzipBytes: autoPreloadGzipBytes }), nonce);
  };
  const installActions = server => server.middlewares.use(async (request, response, next) => {
    if (!/^\/__isle\/(action|validate)\//.test(request.url ?? '')) return next();
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const origin = `http://${request.headers.host}`;
      const wire = new Request(new URL(request.url, origin), { method: request.method, headers: request.headers, body: Buffer.concat(chunks) });
      const { ir } = await load();
      const result = await createActionHandler(ir, host)(wire);
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
    } catch (error) {
      response.statusCode = 500; response.end(JSON.stringify({ ok: false, error: 'internal_error' }));
      server.config.logger.error(error.message);
    }
  });
  const plugin = {
    name: 'isle-prototype',
    async config(_config, { command }) {
      production = command === 'build';
      const { components: client } = await load();
      return {
        define: {
          __ISLE_RUNTIME_VERSION__: JSON.stringify(runtimeVersion),
          __ISLE_WIDGET_MODE__: JSON.stringify(widget?.runtime ?? 'shared'),
          __ISLE_DEBUG__: diagnostics ?? !production,
          __ISLE_PROFILE__: profile,
          __ISLE_EVENT_POLICY__: sharedWidget || !production || client.some(component => component.handlers.some(handler => handler.preventDefault)),
          __ISLE_SELECT__: sharedWidget || !production || client.some(component => component.regions?.features.select || component.regions?.features.boundary),
          __ISLE_EACH__: sharedWidget || !production || client.some(component => component.regions?.features.each),
          __ISLE_BOUNDARY__: sharedWidget || !production || client.some(component => component.regions?.features.boundary),
          __ISLE_REGIONS__: sharedWidget || !production || client.some(component => component.regions),
          __ISLE_RESOURCE_OBJECTS__: sharedWidget || !production || client.some(c=>c.channels?.some(channel=>Object.values(channel.input.record).some(type=>typeof type!=='string'))),
          __ISLE_CHANNELS__: sharedWidget || !production || client.some(c=>c.channels?.length),
          __ISLE_RESOURCES__: sharedWidget || !production || current.resources.length > 0,
          __ISLE_NESTED__: sharedWidget || current.nested,
          // Embedded apps share a complete engine; first-loaded app capabilities never win.
          __ISLE_LAZY_CODE__: sharedWidget || !production || [...policies().values()].some(policy => policy === 'auto' || policy === 'lazy'),
          __ISLE_EAGER_CODE__: sharedWidget || !production || [...policies().values()].some(policy => policy === 'eager'),
          __ISLE_SCHEMA_FORMS__: sharedWidget || !production || client.some(component => component.handlers.some(handler => handler.form)),
          __ISLE_FORMS__: sharedWidget || !production || client.some(component => component.events.some(event => ['input', 'change', 'invalid', 'submit'].includes(event)) ||
            component.bindings.some(binding => binding.kind === 'attribute' && ['required', 'checked', 'readonly', 'multiple', 'selected'].includes(binding.name))),
          __ISLE_TEXT__: sharedWidget || !production || client.some(component => component.bindings.some(binding => binding.kind === 'text')),
          __ISLE_TEXT_RANGES__: sharedWidget || !production || client.some(component => component.bindings.some(binding => binding.range)),
          __ISLE_ATTRIBUTES__: sharedWidget || !production || client.some(component => component.bindings.some(binding => binding.kind === 'attribute')),
          __ISLE_REMOTE__: sharedWidget || !production || client.some(component => component.handlers.some(handler => handler.remote)),
        },
        build: { target: 'es2023', modulePreload: false, minify: 'oxc' },
      };
    },
    configResolved(config) { base = config.base; nonce = config.html?.cspNonce; root = config.root; splitCSS = config.build.cssCodeSplit; },
    async buildStart() {
      const compiled=await load();
      for(const warning of compiled.warnings) {
        const {line,column}=diagnosticLocation(compiled.source,warning);
        this.warn({message:formatWarning(warning,compiled.source,compiled.file),id:compiled.file,loc:{file:compiled.file,line,column:column-1}});
      }
      if (layout) {
        layoutStyles = await loadCheckedStyles(layout, entry,inlineStyles());
        for (const file of layoutStyles.files) this.addWatchFile(file);
        checkedLayout = await resolveCheckedLayout(layout, entry);
        for (const file of checkedLayout.files) this.addWatchFile(file);
      }
      if (!production || !widget) return;
      const { components } = await load();
      this.emitFile({ type: 'chunk', id: widgetLoaderId, fileName: widget.loaderFile, preserveSignature: 'strict' });
      if (components.length) widgetMount = this.emitFile({ type: 'chunk', id: widgetMountId, name: 'isle-widget-mount', preserveSignature: 'strict' });
    },
    buildEnd(error) {
      if (error || !production) return;
      const seen = new Set();
      const inspect = id => {
        if (seen.has(id)) return false;
        seen.add(id);
        const query = new URLSearchParams(id.split('?')[1] ?? '');
        if (/\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/.test(id) && !['inline', 'raw', 'url'].some(key => query.has(key))) return true;
        return this.getModuleInfo(id)?.importedIds.some(inspect) ?? false;
      };
      codeCSS = [...this.getModuleIds()].filter(id => id.startsWith('\0virtual:isle-resource/') || id.startsWith('\0virtual:isle-handler/') || id.startsWith('\0virtual:isle-handler-group/')).some(inspect);
      if (codeCSS && !splitCSS) this.error('CodeRef stylesheet dependencies require build.cssCodeSplit');
    },
    renderChunk(code, chunk) {
      if (!production || !chunk.moduleIds.includes(runtimeId)) return;
      // Capability is known after loading CodeRef module graphs, before final minification.
      // AST-based define preserves strings and lexically shadowed identifiers.
      return transformWithOxc(code, chunk.fileName, { define: { __ISLE_CSS__: String(sharedWidget || codeCSS) }, sourcemap: true });
    },
    async transform(code, id) {
      if (!production || id !== runtimeId) return;
      // Scope these private property names to this module. Cross-chunk ABI is positional;
      // JSON keys, DOM APIs, controller methods and user modules never enter this pass.
      const result = await minify(id, code, { module: true, compress: false, mangle: false,
        mangleProps: { include: /^_/, quoted: false }, sourcemap: true });
      if (result.errors.length) throw new Error(result.errors.map(error => error.message).join('\n'));
      return { code: result.code, map: result.map };
    },
    resolveFileUrl: { order: 'pre', handler({ referenceId, relativePath }) {
      if (!lazyFiles.has(referenceId) && !sharedFiles.has(referenceId)) return;
      return JSON.stringify(relativePath.startsWith('.') ? relativePath : `./${relativePath}`);
    } },
    generateBundle: { order: 'pre', handler(_options, bundle) {
      // Register the compile-time native import graph before Vite emits its manifest.
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const lazy = [...lazyFiles].filter(([, entry]) => chunk.moduleIds.includes(entry.importer)).map(([reference]) => this.getFileName(reference));
        for (const [reference, importer] of sharedFiles) if (chunk.moduleIds.includes(importer)) lazy.push(this.getFileName(reference));
        if (lazy.length) chunk.dynamicImports = [...new Set([...chunk.dynamicImports, ...lazy.filter(file => !chunk.imports.includes(file))])];
      }
    } },
    resolveId(id, importer) {
      if (id.startsWith(resourcePrefix)) return '\0' + id;
      if (id.startsWith(resourceRoute) && id.endsWith('.js')) return '\0' + resourcePrefix + id.slice(resourceRoute.length, -3);
      if (id.startsWith('virtual:isle-regions/')) return '\0' + id;
      if (id === './isle-region-runtime.mjs') return regionRuntimeId;
      if (id === './isle-value-runtime.mjs') return valueRuntimeId;
      if ([widgetLoaderId, widgetMountId, widgetVendorId, widgetEngineId, widgetEngineBridgeId, widgetFormBridgeId].includes(id)) return id;
      if (id === './isle-form-runtime.mjs' && importer?.includes(handlerPrefix)) return production && sharedWidget ? widgetFormBridgeId : formRuntimeId;
      if (id === 'virtual:isle-registry') return registryId;
      if (id === 'virtual:isle-loader') return loaderId;
      if (id === 'virtual:isle-resume') return resumeId;
      if (id === autoEntry) return '\0isle:auto-entry';
      if (id === resumeRoute) return resumeId;
      if (id.startsWith(handlerRoute) && id.endsWith('.js')) return `\0${handlerPrefix}${id.slice(handlerRoute.length, -3)}`;
      if (id.startsWith(handlerPrefix)) return `\0${id}`;
      if (id.startsWith(groupPrefix)) return `\0${id}`;
    },
    async load(id) {
      if (id.startsWith('\0' + resourcePrefix)) {
        const entry = (current ?? await load()).resources.find(resource => resource.name === id.slice(resourcePrefix.length + 1));
        if (!entry) throw new Error('Unknown component resource module');
        return `export { setup } from ${JSON.stringify(entry.path)};`;
      }
      if (id.startsWith('\0virtual:isle-regions/')) return (current ?? await load()).components.find(component => component.regions?.id === id.slice(1))?.regions.code;
      if (id === widgetLoaderId) {
        if (!sharedWidget) return `import { defineWidget } from ${JSON.stringify(widgetRuntimeId)};
          export { mountWidget, runtimeIdentity } from ${JSON.stringify(widgetRuntimeId)};
          export const sharedRuntimeInfo = () => []; defineWidget(${JSON.stringify(widget.tagName)});`;
        const { components } = current ?? await load();
        const source = sharedImport(this, widgetVendorId, 'isle-widget-runtime', widgetLoaderId);
        return `import { claimSharedRuntime, acquireSharedRuntime, sharedRuntimeInfo } from ${JSON.stringify(sharedRuntimeId)};
          export { runtimeIdentity } from ${JSON.stringify(identityId)};
          claimSharedRuntime(${JSON.stringify(runtimeVersion)}, ${JSON.stringify([widgetABI, ...(components.length ? [engineABI()] : [])])});
          const runtime = await acquireSharedRuntime(${JSON.stringify(widgetABI)}, () => import(${source}), { version: ${JSON.stringify(runtimeVersion)}, exports: ['defineWidget', 'mountWidget'] });
          runtime.defineWidget(${JSON.stringify(widget.tagName)});
          export const mountWidget = runtime.mountWidget; export { sharedRuntimeInfo };`;
      }
      if (id === widgetVendorId) return `export const abi = ${JSON.stringify(widgetABI)}; export const version = ${JSON.stringify(runtimeVersion)}; export { defineWidget, mountWidget } from ${JSON.stringify(widgetRuntimeId)};`;
      if (id === widgetEngineId) return `export const abi = ${JSON.stringify(engineABI())}; export const version = ${JSON.stringify(runtimeVersion)};
        export { loadIslands } from ${JSON.stringify(loaderRuntimeId)}; export { resume } from ${JSON.stringify(runtimeId)}; export { handleForm } from ${JSON.stringify(formRuntimeId)};`;
      if (id === widgetEngineBridgeId) {
        const source = sharedImport(this, widgetEngineId, 'isle-widget-engine', widgetEngineBridgeId);
        return `import { acquireSharedRuntime } from ${JSON.stringify(sharedRuntimeId)};
          export default await acquireSharedRuntime(${JSON.stringify(engineABI())}, () => import(${source}), { version: ${JSON.stringify(runtimeVersion)}, exports: ['loadIslands', 'resume', 'handleForm'] });`;
      }
      if (id === widgetFormBridgeId) return `import engine from ${JSON.stringify(widgetEngineBridgeId)}; export const handleForm = engine.handleForm;`;
      if (id === widgetMountId) return `import { boot } from 'virtual:isle-loader'; export { runtimeIdentity } from ${JSON.stringify(identityId)}; export const mount = (root, options) => boot({ ...options, root });`;
      if (id === '\0isle:auto-entry') return `import { boot } from 'virtual:isle-loader'; boot();`;
      if (id === resumeId) return production && sharedWidget
        ? `import engine from ${JSON.stringify(widgetEngineBridgeId)}; export const resume = engine.resume; export { registry } from 'virtual:isle-registry';`
        : `export { resume } from ${JSON.stringify(runtimeId)}; export { registry } from 'virtual:isle-registry';`;
      if (id === loaderId) {
        const { components } = current ?? await load();
        if (!components.length) return 'export const boot = () => undefined;';
        const source = production ? importLazy(this, 'virtual:isle-resume', 'isle-resume', loaderId,
          { id: 'isle:resume', symbol: 'resume', captures: [], kind: 'runtime' })
          : `/* @vite-ignore */ new URL(${JSON.stringify(`${base === './' || base === '' ? '/' : base}${resumeRoute.slice(1)}`)}, document.baseURI).href`;
        const events = [...new Set(components.flatMap(component => component.events))];
        const eager = production && [...policies().values()].includes('eager');
        // Preparing code is independent of attaching the runtime to a Document.
        // Keep an early rejection handled until dispatch can deliver it to onError.
        const loader = eager ? `const ready = import(${source}); ready.catch(() => {}); const load = () => ready;` : `const load = () => import(${source});`;
        const setup = production && sharedWidget ? `import engine from ${JSON.stringify(widgetEngineBridgeId)}; const { loadIslands } = engine;` : `import { loadIslands } from ${JSON.stringify(loaderRuntimeId)};`;
        return `${setup} ${loader} export const boot = (options = {}) => loadIslands(options.root ?? document, load, ${JSON.stringify(events)}, options);`;
      }
      if (id === registryId) {
        const { ir, components } = await load();
        const client = components;
        const schemas = Object.fromEntries(client.map(({ schemaId, fields }) => [schemaId, fields.map(field => field.type)]));
        const handlers = client.flatMap(c => c.handlers);
        const eagerImports = [], ready = [], policy = policies();
        const imports = handlers.map(handler => {
          const emission = current.emissions.get(handler.id);
          if (production && policy.get(handler.id) === 'eager') {
            const local = `e${ready.length}`;
            eagerImports.push(`import { ${emission.symbol} as ${local} } from ${JSON.stringify(emission.id)};`);
            ready.push(`${JSON.stringify(handler.id)}:${local}`);
          }
          const component = client.find(component => component.handlers.includes(handler));
          const source = production ? importLazy(this, emission.id, emission.name, registryId,
            { id: handler.id, symbol: emission.symbol, captures: handler.captures, schemaId: component.schemaId, kind: 'handler', ...handlerMetadata(handler), ...(current.resources.some(resource => resource.name === component.name) ? { requires: ['isle:resume', `${component.name}.$resources`] } : {}) })
            : JSON.stringify(`${base === './' || base === '' ? '/' : base}${handlerRoute.slice(1)}${handler.id}.js`);
          return `${JSON.stringify(handler.id)}:[${source},${JSON.stringify(production ? emission.symbol : handler.symbol)},${JSON.stringify(handler.captures)}]`;
        });
        const resourceImports = current.resources.map(resource => {
          const source = production ? importLazy(this, resourcePrefix + resource.name, resource.name + '.resources', registryId,
            { id: resource.id, symbol: 'setup', captures: [], kind: 'resource', schemaId: resource.schemaId,
              source: sourceLocation(current.source, resource.source, relative(root, current.file).replaceAll('\\', '/')) })
            : JSON.stringify(`${base === './' || base === '' ? '/' : base}${resourceRoute.slice(1)}${resource.name}.js`);
          return `${JSON.stringify(resource.schemaId)}:[${source},"setup",[]]`;
        });
        const used = new Set(handlers.flatMap(handler => handler.actions));
        return `${eagerImports.join('\n')}\nexport const registry = [${JSON.stringify(schemas)},${JSON.stringify([...new Set(client.flatMap(c => c.events))])},{${imports.join(',')}},${JSON.stringify(ir.actions.filter(action => used.has(action.name)).map(action => action.name))},import.meta.url${resourceImports.length ? `,${ready.length ? `{${ready.join(',')}}` : 'null'},{${resourceImports.join(',')}}${client.some(c=>c.channels?.length)?`,${JSON.stringify(Object.fromEntries(client.filter(c=>c.channels?.length).map(c=>[c.schemaId,c.channels])))}`:''}` : ready.length ? `,{${ready.join(',')}}` : ''}];`;
      }
      if (id.startsWith(`\0${handlerPrefix}`)) {
        const name = id.slice(handlerPrefix.length + 1);
        const { components } = current ?? await load();
        const handler = components.flatMap(c => c.handlers).find(h => h.id === name);
        if (!handler) throw new Error(`Unknown Isle handler ${name}`);
        return handler.code;
      }
      if (id.startsWith(`\0${groupPrefix}`)) {
        const { chunks } = current ?? await load();
        const name = id.slice(groupPrefix.length + 1), chunk = chunks.find(chunk => chunk.name === name && chunk.handlers.length > 1);
        if (!chunk) throw new Error(`Unknown Isle handler group ${name}`);
        return chunk.handlers.map((handler, index) => `export { ${handler.symbol} as h${index} } from ${JSON.stringify(handlerPrefix + handler.id)};`).join('\n');
      }
    },
    transformIndexHtml: { order: 'pre', async handler(html) {
      const { components } = await load();
      if (layout) validateCheckedHTML(html);
      const output = renderMounts();
      return { html: html.replace('<!--isle:ssr-->', () => output), tags: [
        ...(!layout ? inlineStyles().map(style=>({tag:'style',attrs:{'data-isle-style':style.scope,...(nonce ? {nonce} : {})},children:style.css.replace(/<\/style/gi,'<\\/style'),injectTo:'head'})) : []),
        ...speculationTags(navigationRules ?? false, nonce),
        ...(!production && (diagnostics ?? true) && components.length && cost !== false ? [{ tag: 'script',
          attrs: { type: 'application/json', 'data-isle-cost': '1', ...(nonce ? { nonce } : {}) },
          children: encodeSnapshot(costReport()), injectTo: 'body' }] : []),
        ...(components.length ? [
          ...(!production ? developmentTags() : []),
          { tag: 'script', attrs: { type: 'module', src: clientEntry ?? autoEntry }, injectTo: 'body' },
        ] : []),
      ] };
    } },
    configureServer(server) {
      server.watcher.add(entry);
      installActions(server);
    },
    configurePreviewServer(server) { if (host) installActions(server); },
    async handleHotUpdate(context) {
      if (context.file === entry) {
        current = undefined;
        const compiled=await load();
        compiled.warnings.forEach(warning=>context.server.config.logger.warn(formatWarning(warning,compiled.source,compiled.file)));
        for (const module of context.server.moduleGraph.idToModuleMap.values()) if (module.id?.includes('isle')) context.server.moduleGraph.invalidateModule(module);
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
  const manifestPlugin = {
    name: 'isle-code-manifest',
    generateBundle: { order: 'post', handler(_options, bundle) {
      let manifest;
      if (current.components.length) {
        const references = [...lazyFiles].flatMap(([reference, { plans }]) => [...plans.values()].map(plan => ({ ...plan, file: this.getFileName(reference) })));
        manifest = createCodeManifest(bundle, references, base, policies(), { gzipBytes: autoPreloadGzipBytes });
        this.emitFile({ type: 'asset', fileName: 'isle.manifest.json', source: `${JSON.stringify(manifest, null, 2)}\n` });
        const tags = loadingTags(manifest, nonce);
        if (!sharedWidget && !codeCSS && tags.some(tag => tag.attrs?.['data-isle-styles'])) this.error('Unrecognized CodeRef CSS dependency; stylesheet capability could not be inferred');
        for (const output of Object.values(bundle)) if (output.type === 'asset' && output.fileName.endsWith('.html')) output.source = injectLoadingTags(String(output.source), tags);
      }
      const report = costReport(manifest);
      if (report) {
        this.emitFile({ type: 'asset', fileName: 'isle.cost.json', source: `${JSON.stringify(report, null, 2)}\n` });
        if ((diagnostics ?? false) && current.components.length) {
          const tag = `<script type="application/json" data-isle-cost="1"${nonce ? ` nonce="${escapeHtml(nonce)}"` : ''}>${encodeSnapshot(report)}</script>`;
          for (const output of Object.values(bundle)) if (output.type === 'asset' && output.fileName.endsWith('.html')) {
            const html = String(output.source);
            output.source = html.includes('</body>') ? html.replace('</body>', () => `${tag}</body>`) : `${html}${tag}`;
          }
        }
        if (!report.ok) this.error(`Isle cost budget failed: ${report.budget.checks.filter(check => check.status !== 'pass').map(check => `${check.entry}.${check.metric}: ${check.status} (${check.actual ?? 'unknown'} / ${check.max})`).join(', ')}`);
      }
      if (widget) {
        const descriptor = buildWidgetDescriptor(widget, componentStyleTags(inlineStyles())+renderMounts(), widgetMount && this.getFileName(widgetMount), manifest);
        this.emitFile({ type: 'asset', fileName: widget.descriptorFile, source: `${JSON.stringify(descriptor)}\n` });
      }
    } },
  };
  const layoutPlugin = {
    name: 'isle-checked-layout', enforce: 'post',
    generateBundle: {order:'post',async handler(_options,bundle) {
      if(!layout) return;
      const documents = Object.values(bundle).filter(output => output.type === 'asset' && output.fileName.endsWith('.html'));
      if (documents.length !== 1) this.error('E_ISLE_LAYOUT: Checked build requires exactly one HTML document');
      const output = documents[0];
      const certificate = await certifyLayout({html:String(output.source),file:output.fileName,sourceFile:current.file,source:current.source,ir:current.ir,component:mounts[0].component,props:mounts[0].props ?? {},
        documentId:resolve(root,output.fileName).replaceAll('\\','/'),base,rendered:renderMounts(),layout:(checkedLayout?.source === layout ? checkedLayout : await resolveCheckedLayout(layout,entry)).layout,styles:layoutStyles,bundle,runtimeDirectory:dirname(runtimeId).replaceAll('\\','/') + '/'});
      // Integrity warnings (clipped content, nested scrolling) do not fail the build; errors already did.
      for (const warning of [...(certificate.report.integrity?.warnings ?? []), ...(certificate.report.accessibility?.warnings ?? [])]) this.warn(`${warning.code}: ${warning.message} (width ${warning.range.minExact}..${warning.range.maxExact})`);
      this.emitFile({type:'asset',fileName:'isle.layout.json',source:JSON.stringify(certificate)+'\n'});
    }},
  };
  const layoutStylesPlugin = {
    name:'isle-checked-styles',
    transformIndexHtml:{order:'post',async handler() { await load();if(!layout) return [];layoutStyles=await loadCheckedStyles(layout,entry,inlineStyles());return [injectCheckedStyles(layoutStyles,nonce)]; }},
    async handleHotUpdate(context) {
      if (layout && layoutStyles?.files.includes(context.file)) {
        layoutStyles = await loadCheckedStyles(layout,entry,inlineStyles());
        context.server.ws.send({type:'full-reload'});
        return [];
      }
    },
  };
  return [plugin,layoutStylesPlugin,manifestPlugin,layoutPlugin];
}

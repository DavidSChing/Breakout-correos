// Run with: node test-dashboard.cjs
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const vm = require('node:vm');

class Element {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.attributes = {};
        this.dataset = {};
    }
    set innerHTML(value) { this.children = []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    insertAdjacentHTML() {}
}

async function checkDashboard() {
    const html = readFileSync(`${__dirname}/index.html`, 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const paths = readdirSync(__dirname, { recursive: true })
        .filter(path => path.endsWith('.html') && path !== 'index.html');
    const elements = Object.fromEntries(
        ['categories-root', 'template-count', 'collection-count', 'status']
            .map(id => [id, new Element('div')])
    );
    const context = vm.createContext({
        document: {
            getElementById: id => elements[id],
            createElement: tag => new Element(tag)
        },
        window: { location: { hostname: 'example.github.io', pathname: '/templates/' } },
        console: { error() {} },
        fetch: async url => ({
            ok: true,
            json: async () => url.includes('/git/trees/')
                ? { tree: paths.map(path => ({ type: 'blob', path })) }
                : { default_branch: 'main' }
        })
    });
    await vm.runInContext(script, context);

    const root = elements['categories-root'];
    const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
    const links = descendants(root).filter(node => node.tagName === 'a');
    assert.equal(elements['template-count'].textContent, paths.length);
    assert.equal(elements['collection-count'].textContent, root.children.length);
    assert.deepEqual(links.map(link => link.href).sort(), paths.sort());
    assert.equal(elements.status.dataset.state, 'ready');
    assert.equal(root.attributes['aria-busy'], 'false');
    assert.equal(root.children.at(-1).children[0].children[1].textContent, 'Otros correos');
    for (const link of links) {
        assert.equal(link.className, 'email-item');
        assert.equal(link.target, '_blank');
        assert.equal(link.rel, 'noopener noreferrer');
        assert.ok(link.attributes['aria-label'].includes('nueva pestana'));
    }
    assert.deepEqual(
        links.filter(link => link.href.startsWith('Breakout Capital/')).map(link => link.children[1].textContent),
        ['v1.0', 'v1.1', 'v1.2', 'v1.3', 'v2.0', 'v2.1']
    );

    vm.runInContext('render({})', context);
    assert.equal(root.children.length, 0);
    assert.equal(elements['template-count'].textContent, 0);
    assert.equal(elements['collection-count'].textContent, 0);

    context.fetch = async () => { throw new Error('Offline'); };
    await vm.runInContext('init()', context);
    assert.equal(elements.status.dataset.state, 'error');
    assert.equal(root.attributes['aria-busy'], 'false');
    context.window.location.hostname = 'localhost';
    await vm.runInContext('init()', context);
    assert.ok(elements.status.textContent.includes('GitHub Pages'));
    console.log(`Dashboard checks passed: ${paths.length} template links, counts, version order, and error states.`);
}

checkDashboard().catch(error => { console.error(error); process.exitCode = 1; });

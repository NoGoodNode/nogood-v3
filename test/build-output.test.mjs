import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const buildDir = join(process.cwd(), "_build");

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function outputExists(urlPath) {
	const path = join(buildDir, urlPath.replace(/^\//, ""));
	return existsSync(path) || existsSync(join(path, "index.html"));
}

function outputHtml(urlPath) {
	const outputPath = urlPath === "/" ? "index.html" : join(urlPath, "index.html");
	return readFileSync(join(buildDir, outputPath), "utf8");
}

test("generated HTML only references local assets that exist in the build", () => {
	const missing = [];
	for (const file of walk(buildDir).filter(path => path.endsWith(".html"))) {
		const html = readFileSync(file, "utf8");
		for (const match of html.matchAll(/(?:href|src|poster)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
			const url = match[1];
			if (!url.startsWith("/assets/")) {
				continue;
			}
			if (!outputExists(url)) missing.push(`${file.replace(`${buildDir}/`, "")}: ${url}`);
		}
	}
	assert.deepEqual(missing, []);
});

test("sitemap only contains valid public site URLs", () => {
	const sitemap = readFileSync(join(buildDir, "sitemap.xml"), "utf8");
	const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
	assert.ok(urls.length > 0);
	assert.ok(urls.every(url => url.startsWith("https://www.nogood.studio/")));
	assert.ok(urls.every(url => !url.endsWith("/404.html")));
	assert.equal(new Set(urls).size, urls.length);
});

test("generated JSON-LD is valid JSON", () => {
	const invalid = [];
	for (const file of walk(buildDir).filter(path => path.endsWith(".html"))) {
		const html = readFileSync(file, "utf8");
		for (const match of html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)) {
			try {
				JSON.parse(match[1]);
			} catch (error) {
				invalid.push(`${file.replace(`${buildDir}/`, "")}: ${error.message}`);
			}
		}
	}
	assert.deepEqual(invalid, []);
});

test("legacy book routes redirect to their blog replacements", () => {
	const redirects = {
		"/book/announcement": "/blog/announcement/",
		"/book/beginnings": "/blog/beginnings/",
		"/book/closing-in": "/blog/closing-in/",
		"/book/loops": "/blog/loops/",
		"/book/print-signed-shipped": "/blog/print-signed-shipped/",
		"/book/progress": "/blog/progress/",
		"/book/throwback": "/blog/throwback/",
	};
	for (const [from, to] of Object.entries(redirects)) {
		const html = outputHtml(from);
		assert.match(html, new RegExp(`http-equiv="refresh" content="0; url=${to}"`));
		assert.match(html, new RegExp(`location\\.replace\\("${to}"`));
	}
});

test("Snipcart uses the established global bootstrap", () => {
	assert.match(outputHtml("/shop"), /window\.SnipcartSettings/);
	assert.match(outputHtml("/work"), /window\.SnipcartSettings/);
	assert.match(outputHtml("/shop"), /window\.LoadSnipcart/);
	assert.match(outputHtml("/work"), /window\.LoadSnipcart/);
});

test("homepage defers HLS until the Radio stream enters view", () => {
	const home = outputHtml("/");
	assert.doesNotMatch(home, /import Hls from/);
	assert.match(home, /await import\('\/assets\/js\/vendor\/hls\.js'\)/);
});

test("Radio uses its adapter instead of a second zap-feed module", () => {
	assert.doesNotMatch(outputHtml("/radio"), /src="\/assets\/js\/zap-feed\.js"/);
});

test("book stock only exposes the remaining standard edition", () => {
	const product = outputHtml("/the-nogood-book");
	assert.match(product, /Collectors edition/);
	assert.match(product, /Sold out/);
	assert.match(product, /data-item-id="book-regular-edition"/);
	assert.match(product, /data-book-inventory="265"/);
	assert.match(product, /\/ 400 available/);
	assert.doesNotMatch(product, /book-regular-edition-print|The NoGood Book \+ print/);

	const generatedStockFiles = walk(buildDir).filter(path => path.endsWith(".html") || path.endsWith(".js"));
	for (const file of generatedStockFiles) {
		assert.doesNotMatch(readFileSync(file, "utf8"), /\/print-sales/);
	}
});

test("only purchase and Patreon clicks use custom Umami events", () => {
	const events = new Set();
	for (const file of walk(buildDir).filter(path => path.endsWith(".html"))) {
		const html = readFileSync(file, "utf8");
		for (const match of html.matchAll(/data-umami-event="([^"]+)"/g)) events.add(match[1]);
	}
	assert.deepEqual([...events].sort(), ["add-to-cart", "patreon-click"]);

	const home = outputHtml("/");
	assert.equal((home.match(/patreon\.com\/nogood_studio/g) || []).length, 5);
	assert.equal((home.match(/data-umami-event="patreon-click"/g) || []).length, 5);
	assert.deepEqual(
		[...home.matchAll(/data-umami-event="patreon-click" data-umami-event-location="([^"]+)"/g)].map(match => match[1]).sort(),
		["badge", "footer", "heading", "homepage", "paragraph"],
	);
});

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

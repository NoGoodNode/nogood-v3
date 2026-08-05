const { DateTime } = require("luxon");
const CleanCSS = require("clean-css");
const YAML = require("yaml");

function registerFilters(eleventyConfig) {
	eleventyConfig.addDataExtension("yaml", contents => YAML.parse(contents));
	eleventyConfig.addNunjucksFilter("withoutTag", (items, tag) =>
		items.filter(item => !(item.data.tags || []).includes(tag))
	);
	eleventyConfig.addFilter("feedImageStyles", html =>
		html.replace(/<picture>/g, "<p><picture>").replace(/<\/picture>/g, "</picture></p>")
	);
	eleventyConfig.addFilter("cssmin", code => new CleanCSS({}).minify(code).styles);
	eleventyConfig.addFilter("json", value => JSON.stringify(value ?? ""));
	eleventyConfig.addFilter("postDate", dateObj => {
		const date = dateObj instanceof Date
			? DateTime.fromJSDate(dateObj, { zone: "Europe/Amsterdam" })
			: DateTime.fromISO(String(dateObj), { zone: "Europe/Amsterdam" });
		return date.setLocale("en").toFormat("dd/MM/yyyy");
	});
}

module.exports = { registerFilters };

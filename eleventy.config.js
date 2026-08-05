const { createClippings } = require("./lib/clippings");
const { registerAssets } = require("./lib/assets");
const { registerCollections } = require("./lib/collections");
const { registerFilters } = require("./lib/filters");
const { registerImages } = require("./lib/images");
const { registerTransforms } = require("./lib/transforms");

async function configure(eleventyConfig) {
	eleventyConfig.ignores.add("source/snippets");
	eleventyConfig.ignores.add("source/overlay/**/*.md");

	const clippings = createClippings(__dirname);
	registerAssets(eleventyConfig);
	registerCollections(eleventyConfig, clippings);
	registerFilters(eleventyConfig);
	registerImages(eleventyConfig);
	registerTransforms(eleventyConfig);

	return {
		dir: {
			output: "_build",
			data: "_data",
			includes: "_includes",
			input: "source",
		},
	};
}

configure.config = {
	templateFormats: ["html", "njk", "md"],
};

module.exports = configure;

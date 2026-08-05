function registerCollections(eleventyConfig, clippings) {
	eleventyConfig.on("eleventy.before", () => clippings.read());
	eleventyConfig.addCollection("clippingsHome", async () => (await clippings.read()).slice(0, 5));
	eleventyConfig.addCollection("clippingsNow", async () => (await clippings.read()).slice(0, 10));
	eleventyConfig.addCollection("clippingsAll", () => clippings.read());

	eleventyConfig.addCollection("feedPosts", collectionApi =>
		collectionApi.getAll()
			.filter(item => item.data.layout !== "product")
			.filter(item => item.inputPath.includes("/posts/"))
			.filter(item => !item.inputPath.includes("/posts/products/"))
			.filter(item => !item.data.unlisted)
			.sort((a, b) => b.date - a.date)
	);

	eleventyConfig.addCollection("contextArticle", collectionApi =>
		collectionApi.getFilteredByTag("contextArticle")
			.sort((a, b) => a.data.order - b.data.order)
	);

	eleventyConfig.addCollection("sitemapPages", collectionApi =>
		collectionApi.getAll()
			.filter(item => typeof item.url === "string" && item.url.startsWith("/"))
			.filter(item => item.url !== "/404.html")
			.filter(item => !item.data.unlisted)
			.filter(item => !item.inputPath.includes("/overlay/"))
	);
}

module.exports = { registerCollections };

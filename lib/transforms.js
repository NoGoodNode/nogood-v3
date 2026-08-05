function registerTransforms(eleventyConfig) {
	eleventyConfig.addTransform("addRefParam", function (content) {
		if (!this.page || !this.page.outputPath || !this.page.outputPath.endsWith(".html")) return content;
		return content.replace(/(<a\s+[^>]*?href=)"(https?:\/\/[^\"]+)"/gi, (match, prefix, url) => {
			try {
				const parsed = new URL(url);
				if (parsed.hostname.replace(/^www\./, "") === "nogood.studio") return match;
				parsed.searchParams.set("ref", "nogood.studio");
				return `${prefix}"${parsed.toString()}"`;
			} catch {
				return match;
			}
		});
	});
}

module.exports = { registerTransforms };

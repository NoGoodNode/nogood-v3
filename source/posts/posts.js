module.exports = {
	tags: "post",
	author: "NoGood",
	eleventyComputed: {
		eleventyExcludeFromCollections: (data) => data.draft === true
	}
};

function registerAssets(eleventyConfig) {
	const copies = [
		["source/.well-known/nostr.json", ".well-known/nostr.json"],
		["source/CNAME", "CNAME"],
		["source/.htaccess", ".htaccess"],
		["source/overlay/names.txt", "overlay/names.txt"],
		["source/overlay/drawing/styles/tokens.css", "assets/css/overlays/drawing/tokens.css"],
		["source/overlay/drawing/styles/base.css", "assets/css/overlays/drawing/base.css"],
		["source/overlay/drawing/styles/utilities.css", "assets/css/overlays/drawing/utilities.css"],
		["source/overlay/drawing/styles/components.css", "assets/css/overlays/drawing/components.css"],
		["source/overlay/drawing/styles/main.css", "assets/css/overlays/drawing/main.css"],
		["source/overlay/drawing/styles/pause.css", "assets/css/overlays/drawing/pause.css"],
		["source/favicon.ico", "favicon.ico"],
		["source/assets/img/favicon.svg", "assets/img/favicon.svg"],
		["source/assets/img/NoGood_Logo.svg"],
		["source/assets/img/nogood_sign.png", "assets/img/nogood_sign.png"],
		["source/assets/img/NoGood_OG.png", "assets/img/NoGood_OG.png"],
		["source/style.css"],
		["source/assets/css", "assets/css"],
		["source/assets/js", "assets/js"],
		["source/assets/fonts", "assets/fonts"],
		["source/assets/icons", "assets/icons"],
		["source/assets/img/shop/snipcart", "assets/img/shop/snipcart"],
		["source/assets/img/buttonwall", "assets/img/buttonwall"],
		["source/assets/img/og", "assets/img/og"],
		["source/assets/downloads", "assets/downloads"],
		["source/assets/img/NG_Zap_Animation.gif", "assets/img/NG_Zap_Animation.gif"],
		["source/assets/img/NG_Block_Animation.gif", "assets/img/NG_Block_Animation.gif"],
		["source/assets/img/about-opener.mp4", "assets/img/about-opener.mp4"],
		["source/assets/img/radio-bg.mp4", "assets/img/radio-bg.mp4"],
		["source/assets/img/projects/Collected_BTCBackup.mp4", "assets/img/projects/Collected_BTCBackup.mp4"],
		["source/assets/img/projects/Collected_PCB.mp4", "assets/img/projects/Collected_PCB.mp4"],
		["source/assets/img/book-promo.mp4", "assets/img/book-promo.mp4"],
		["source/assets/img/book/Book_Promo_Poster.jpg", "assets/img/book/Book_Promo_Poster.jpg"],
		["source/assets/img/book/book-shoot.mp4", "assets/img/book/book-shoot.mp4"],
		["source/assets/img/book/NG_PrinterVisit.mp4", "assets/img/book/NG_PrinterVisit.mp4"],
		["source/assets/img/book/NG_Unboxing.mp4", "assets/img/book/NG_Unboxing.mp4"],
		["source/assets/img/book/NG_BooksEverywhere.mp4", "assets/img/book/NG_BooksEverywhere.mp4"],
		["source/assets/img/book/NG_Shoot_Book_Cover.jpg", "assets/img/book/NG_Shoot_Book_Cover.jpg"],
		["source/assets/img/book/NG_Book_Cover.jpg", "assets/img/book/NG_Book_Cover.jpg"],
		["source/assets/img/press/book-vol1/video", "assets/img/press/book-vol1/video"],
	];
	for (const [source, destination] of copies) {
		eleventyConfig.addPassthroughCopy(destination ? { [source]: destination } : source);
	}
}

module.exports = { registerAssets };

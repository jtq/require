var require = (function(rootUrl) {

	rootUrl = rootUrl + "";

	var baseRequire = function(baseUrl, modulePath, onLoaded) {
		// Convert relative module path to absolute and normalise to get rid of any ./ or ../
		var thisModuleUrl = resolvePath(baseUrl, modulePath);

		var callback = onLoaded;

		// Get module source
		var req = new XMLHttpRequest();
		req.open("GET", thisModuleUrl, true);
		req.onreadystatechange = function () {
	  		if (req.readyState != 4 || req.status != 200) return;
	  		var source = req.responseText;

	  		var module = (function(source) {	// Create new scope for eval

	  			var require = baseRequire.bind(null, thisModuleUrl);

	  			var module = {
	  				exports: {}
	  			};
	  			var exports = module.exports;

	  			eval(source);

	  			return module.exports;
	  		})(source);

	  		if(callback) {
	  			callback(module);
	  		}
		};
		req.send();
	};

	};

	var resolvePath = function(baseUrl, relativePath) {
		baseUrl = baseUrl.substr(0, baseUrl.lastIndexOf("/")+1);	// Base URL minus any trailing filename
		var denormalisedUrl = baseUrl + relativePath;
		var normalisedUrl = denormalisedUrl.replace(/([\/^])\.\//g, '$1');	// Replace "/./" and "./" with ""
		while(normalisedUrl.match(/[\/^]\.\.\//)) {
			normalisedUrl = normalisedUrl.replace(/([\/^])[^\/]+\/\.\.\/?/g, '/');	// Replace "/dir/../" and "/dir/.." with "/", or "dir/../" and "dir/.." with ""
		}
		return normalisedUrl;
	};

	return baseRequire.bind(null, rootUrl);
})(document.location);
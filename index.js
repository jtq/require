var require = (function(globalRootUrl) {

	globalRootUrl = globalRootUrl + "";

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





		  		process(thisModuleUrl, source, callback);
		};
		req.send();
	};

	var compile = function(source, thisModuleUrl) {	// Create new scope for eval

		var require = baseRequire.bind(null, thisModuleUrl);
		var module = {
			exports: {}
		};
		var exports = module.exports;	/// Handle exports= and module.exports=

		eval(source);

		return module.exports;
	};

	var process = function(thisModuleUrl, source, callback) {
		// Finally compile the source of our module now all the dependencies have been compiled
		//console.log("compiling", thisModuleUrl);
  		var module = compile(source, thisModuleUrl);
  		//console.log("compiled", thisModuleUrl, module);

  		if(callback) {
  			callback(module);
  		}
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

	var globalRequire = baseRequire.bind(null, globalRootUrl);
	return globalRequire;
})(document.location);
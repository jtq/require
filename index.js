var require = (function(globalRootUrl) {

	globalRootUrl = globalRootUrl + "";

	var cache = {};

	var baseRequire = function(baseUrl, modulePath, onLoaded) {
		// Convert relative module path to absolute and normalise to get rid of any ./ or ../
		var thisModuleUrl = resolvePath(baseUrl, modulePath);

		var callback = onLoaded;

		// If we already have a cached copy of the module, synchronously return it (for modules that use `var mod = require('mod');`)
		if(cache[thisModuleUrl]) {
			if(callback) {	// Equally, if the calling code has passed in a callback to be run when this module is ready, run it as well
	  			callback(cache[thisModuleUrl]);
	  		}
			return cache[thisModuleUrl];
		}

		// If not cached then we're loading/compiling asynchronously, so get module source from remote URL:
		var req = new XMLHttpRequest();
		req.open("GET", thisModuleUrl, true);
		req.onreadystatechange = function () {

			// If this module was already asynchronously loaded by another module requiring it before this request finished, dump out of this request
			// (no sense in compiling the module twice) and call any callback on this request to say the module is already ready
			if(cache[thisModuleUrl]) {
				if(req.readyState != 4 && req.status != 0) { // We're aborting the request, so don't trigger the logic again when readystate changes one last time because of the abort
					//console.log("cached", thisModuleUrl, "found (from XMLHttpRequest race condition) - skipping compilation");
					req.abort();	// Don't care what stage this request is at - kill it because it's no longer needed
					if(callback) {
	  					callback(cache[thisModuleUrl]);
	  				}
	  			}
				return;
			}
			if (req.readyState != 4 || req.status != 200) return;

	  		var source = req.responseText;

	  		// Check whether this module requires submodules, in which case compiling it will need deferring until we've downloaded/built those
	  		var subModules = {}, subModuleUrls;
	  		var matches;
	  		var requireRegexp = /[\s=;{}]require\s*\(\s*['""]\s*([a-zA-Z0-9_\-\.\/\\]+)\s*['""]/g;
	  		while((matches = requireRegexp.exec(source)) !== null) {
	  			var subModuleUrl = resolvePath(thisModuleUrl, matches[1]);
	  			subModules[subModuleUrl] = false;
	  		}
	  		subModuleUrls = Object.keys(subModules);	// Optimisation to avoid repeated calls to Object.keys(subModules)
	  		//console.log("loading", thisModuleUrl, "- dependencies", subModuleUrls);

	  		// No need to filter for already-cached modules here, as baseRequire() already handles that

	  		if(subModuleUrls.length) {	// If this submodule has unmet dependencies, download/build them now
		  		subModuleUrls.forEach(function(subModuleUrl) {
		  			baseRequire("", subModuleUrl, function(module) {
		  				// Now this subModule is compiled mark it off the "unmet dependencies" list
		  				//console.log("submodule", subModuleUrl, "loaded for ", thisModuleUrl);
		  				subModules[subModuleUrl] = true;
		  				// And if it's the last one, finally compile the original module that depended on it
		  				if(subModuleUrls.every(function(key) { return subModules[key]; })) {
		  					//console.log("met dependencies for", thisModuleUrl, "- building");
		  					process(thisModuleUrl, source, callback);
		  				}
		  			});
		  		});
		  	}
		  	else {	// Otherwise (no unmet dependencies), build immediately
		  		process(thisModuleUrl, source, callback);
		  	}
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

  		cache[thisModuleUrl] = module;

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
	globalRequire.cache = cache;
	return globalRequire;
})(document.location);
var require = (function(globalRootUrl) {

	globalRootUrl = globalRootUrl + "";

	var cache = {};

	var baseRequire = function(baseUrl, modulePath, onLoaded) {
		// Convert relative module path to absolute and normalise to get rid of any ./ or ../
		var thisModuleUrl = resolvePath(baseUrl, modulePath);

		var callback = onLoaded;

		var cacheEntry = cache[thisModuleUrl];
		if(cacheEntry) {	// Have we heard of this module at all yet?
			if(cacheEntry.loaded) {	// If we already have a cached copy of the module, synchronously return it (for modules that use `var mod = require('mod');`)
				if(callback) {	// Equally, if the calling code has passed in a callback to be run when this module is ready, run it as well
		  			callback(cacheEntry.module);
		  		}
				return cacheEntry.module;
			}
			else {	// The module is in the process of being requested, so just add a callback
				cacheEntry.callbacks.push(callback);
			}
		}
		else {	// Brand new module (not already loaded, not already in the process of being requested)

			cacheEntry = {
				path: thisModuleUrl,
				loaded: false,
				module: {},
				callbacks: callback ? [callback] : [],
				dependencies: []
			};
			cache[thisModuleUrl] = cacheEntry;

			// If not cached then we're loading/compiling asynchronously, so get module source from remote URL:
			var req = new XMLHttpRequest();
			req.open("GET", thisModuleUrl, true);
			req.onreadystatechange = function () {

				if (req.readyState != 4 || req.status != 200) return;

		  		var source = req.responseText;

		  		// Check whether this module requires submodules, in which case compiling it will need deferring until we've downloaded/built those
		  		var matches;
		  		var requireRegexp = /[\s=;{}]require\s*\(\s*['""]\s*([a-zA-Z0-9_\-\.\/\\]+)\s*['""]/g;
		  		while((matches = requireRegexp.exec(source)) !== null) {
		  			var subModuleUrl = resolvePath(thisModuleUrl, matches[1]);
		  			cacheEntry.dependencies.push(subModuleUrl);
		  		}
		  		//console.log("loading", thisModuleUrl, "- dependencies", cacheEntry.dependencies);

		  		// No need to filter for already-cached modules here, as baseRequire() already handles that

		  		if(cacheEntry.dependencies.length) {	// If this submodule has unmet dependencies, download/build them now
			  		cacheEntry.dependencies.forEach(function(subModuleUrl) {
			  			baseRequire("", subModuleUrl, function(module) {
			  				// Now this subModule is compiled mark it off the "unmet dependencies" list
			  				//console.log("submodule", subModuleUrl, "loaded for ", thisModuleUrl);
			  				cache[subModuleUrl].loaded = true;
			  				// And if it's the last one, finally compile the original module that depended on it
			  				if(cacheEntry.dependencies.every(function(key) { return cache[key].loaded; })) {
			  					//console.log("met dependencies for", thisModuleUrl, "- building");
			  					process(thisModuleUrl, source);
			  				}
			  			});
			  		});
			  	}
			  	else {	// Otherwise (no unmet dependencies), build immediately
			  		process(thisModuleUrl, source);
			  	}
			};
			req.send();
		}
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

	var process = function(thisModuleUrl, source) {
		// Finally compile the source of our module now all the dependencies have been compiled
		//console.log("compiling", thisModuleUrl);
  		var module = compile(source, thisModuleUrl);
  		//console.log("compiled", thisModuleUrl, module);

  		cache[thisModuleUrl].module = module;
  		cache[thisModuleUrl].loaded = true;

  		cache[thisModuleUrl].callbacks.forEach(function(callback) {
  			callback(module);
  		});
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